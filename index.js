const fs = require("fs");
const path = require("path");
const {getBucket} = require("cloud-bucket");
const { nanoid } = require('nanoid');
const mime = require('mime-types');
const got = require("got");
const winston = require.main.require("winston");
const nconf = require.main.require('nconf');
const sharpStream = sharp({
	failOnError: false
});
const Package = require("./package.json");
const meta = require.main.require("./src/meta");
const db = require.main.require("./src/database");

let plugin = {};
let cloudProvider = process.env.CLOUD_PROVIDER || "";
let settings;
let cloudConn;

const setConfig = (provider) => {
	if (provider === 'GCP') {
		settings = {
			bucketName: process.env.UPLOADS_BUCKET || "",
			project_id: process.env.PROJECT_ID || "",
			client_email: process.env.SA_EMAIL || "",
			private_key: process.env.PRIVATE_KEY || "",
		  }
	} else if (provider === 'AWS') {
		settings = { 
			bucketName: process.env.UPLOADS_BUCKET || "",
			access_key_id: process.env.S3_ACCESS_KEY_ID || "",
			access_key_secret: process.env.S3_ACCESS_KEY_SECRET || ""
		  };
	} else {
		winston.error('Only GCP and AWS are supported');
	}
}



function fetchSettings(callback) {
	db.getObjectFields(Package.name, Object.keys(settings), function (err, newSettings) {
		if (err) {
			winston.error(err.message);
			if (typeof callback === "function") {
				callback(err);
			}
			return;
		}
		if (newSettings.cloudProvider) cloudProvider = newSettings.cloudProvider;
		setConfig(cloudProvider);
		if (newSettings["access_key_id"]) settings["access_key_id"] = newSettings["access_key_id"];
		if (newSettings["access_key_secret"]) settings["access_key_secret"] = newSettings["access_key_secret"];
		if (newSettings.bucketName) settings.bucketName = newSettings.bucketName;
		if (newSettings["project_id"]) settings["project_id"] = newSettings["project_id"];
		if (newSettings["client_email"]) settings["client_email"] = newSettings["client_email"];
		if (newSettings["private_key"]) settings["private_key"] = newSettings["private_key"];
		if (typeof callback === "function") {
			callback();
		}
	});
}

function makeError(err) {
	if (err instanceof Error) {
		err.message = Package.name + " :: " + err.message;
	} else {
		err = new Error(Package.name + " :: " + err);
	}
	winston.error(err.message);
	return err;
}

plugin.activate = function (data) {
	if (data.id === 'nodebb-plugin-cloud-uploads') fetchSettings();
};

plugin.deactivate = function (data) {
	if (data.id === 'nodebb-plugin-cloud-uploads') cloudConn = null;
};

plugin.load = function (params, callback) {
	fetchSettings(function (err) {
		if (err) return winston.error(err.message);
		const adminRoute = "/admin/plugins/cloud-uploads";

		params.router.get(adminRoute, params.middleware.applyCSRF, params.middleware.admin.buildHeader, renderAdmin);
		params.router.get("/api" + adminRoute, params.middleware.applyCSRF, renderAdmin);
		params.router.post("/api" + adminRoute + "/cloudsettings", cloudsettings);
		params.router.post("/api" + adminRoute + "/credentials", credentials);

		callback();
	});
};

function renderAdmin(req, res) {
	const token = req.csrfToken();
	let forumPath = nconf.get('url');
	if (forumPath.split("").reverse()[0] != "/" ) forumPath = forumPath + "/";

	const data = {
		bucketName: settings.bucketName,
		project_id: settings["project_id"],
		client_email: settings["client_email"],
		private_key: settings["private_key"],
		forumPath: forumPath,
		access_key_id: settings["access_key_id"],
		access_key_secret: settings["access_key_secret"],
		csrf: token
	};

	res.render("admin/plugins/cloud-uploads", data);
}

function cloudsettings(req, res, next) {
	var data = req.body;
	var newSettings = {
		bucketName: data.bucketName || "",
		project_id: process.env.PROJECT_ID || ""
	};
	saveSettings(newSettings, res, next);
}

function credentials(req, res, next) {
	const data = req.body;
	const newSettings = {
		access_key_id: data["access_key_id"] || "",
		access_key_secret: data["access_key_secret"] || "",
		client_email: data["client_email"] || "",
		private_key: data["private_key"] || "",
	};

	saveSettings(newSettings, res, next);
}

function saveSettings(settings, res, next) {
	db.setObject(Package.name, settings, function (err) {
		if (err) return next(makeError(err));
		fetchSettings();
		res.json("Saved!");
	});
}

plugin.uploadImage = function (data, callback) {
	var image = data.image;

	if (!image) {
		winston.error("invalid image" );
		return callback(new Error("invalid image"));
	}
	//check filesize vs. settings
	if (image.size > parseInt(meta.config.maximumFileSize, 10) * 1024) {
		winston.error("error:file-too-big, " + meta.config.maximumFileSize );
		return callback(new Error("[[error:file-too-big, " + meta.config.maximumFileSize + "]]"));
	}

	const type = image.url ? "url" : "file";
	const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/pjpeg', 'image/jpg', 'image/svg+xml'];

	if (type === "file") {
		if (!image.path) return callback(new Error("invalid image path"));
		if (allowedMimeTypes.indexOf(mime.lookup(image.path)) === -1) return callback(new Error("invalid mime type"));
		fs.readFile(image.path, function (err, buffer) {
			uploadToCloud(image.name, err, buffer, callback);
		});
	} else {
		if (allowedMimeTypes.indexOf(mime.lookup(image.url)) === -1) return callback(new Error("invalid mime type"));
		const filename = image.url.split("/").pop();
		const imageDimension = parseInt(meta.config.profileImageDimension, 10) || 128;
		// const stream = got.stream(image.url).pipe(sharpStream.resize(imageDimension, imageDimension));
		const stream = got.stream(image.url);
		uploadToCloud(filename, null, stream, callback);
	}
};

plugin.uploadFile = function (data, callback) {
	const file = data.file;
	if (!file) return callback(new Error("invalid file"));
	if (!file.path) return callback(new Error("invalid file path"));
	//check filesize vs. settings
	if (file.size > parseInt(meta.config.maximumFileSize, 10) * 1024) {
		winston.error("error:file-too-big, " + meta.config.maximumFileSize );
		return callback(new Error("[[error:file-too-big, " + meta.config.maximumFileSize + "]]"));
	}
	const readStream = fs.createReadStream(file.path);
	uploadToCloud(file.name, null, readStream, callback);
};

function uploadToCloud(filename, err, stream, callback) {
	if (err) return callback(makeError(err));
	let randomFileName = nanoid() + path.extname(filename);
	let bucketUrl;
	if (cloudProvider === "GCP") bucketUrl = `https://storage.cloud.google.com/${settings.bucketName}`;
	if (cloudProvider === "AWS") bucketUrl = `https://s3.amazonaws.com/${settings.bucketName}`;
	if (!cloudConn) cloudConn = await getBucket(settings);
	const writeStream = await cloudConn.createWriteStream(randomFileName);
	const ww = stream.pipe(writeStream);
	ww.on('finish', () => {
		callback(null, {
			name: filename,
			url: bucketUrl + "/" + randomFileName
		});
	});
}

var admin = plugin.admin = {};

admin.menu = function (custom_header, callback) {
	custom_header.plugins.push({
		"route": "/plugins/cloud-uploads",
		"icon": "fa-envelope-o",
		"name": "Cloud Uploads"
	});

	callback(null, custom_header);
};

module.exports = plugin;
