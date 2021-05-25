<h1><i class="fa fa-picture-o"></i> Cloud Uploads Configuration</h1>
<hr/>

<p>You can configure this plugin via a combination of the below, for instance, you can use <em>instance meta-data</em>
	and <em>environment variables</em> in combination. You can also specify values in the form below, and those will be
	stored in the database.</p>

<h3>Environment Variables</h3>
<pre><code>
export CLOUD_PROVIDER="xxx"
export S3_ACCESS_KEY_ID="yyy"
export S3_ACCESS_KEY_SECRET="zzz"
export UPLOADS_BUCKET="aaa"
export PROJECT_ID="bbb"
export SA_EMAIL="ccc"
export PRIVATE_KEY="ddd"
</code></pre>

<p>
	First, choose GCP or AWS as desired Cloud Provider<br/>
	Based on provider, fill in related fields:<br/>
	- Bucket, Access Key ID & Secret - for AWS <br/>
	- Bucket, Project ID, Service Account mail & Provate Key - for Google <br/>
	If both are asset host and path are set, then the url will be http://cdn.mywebsite.com/assets/uuid.jpg.
</p>
<div class="alert alert-warning">
	<p>If you need help, create an <a href="https://github.com/ozonep/nodebb-plugin-s3-uploads/issues/">issue on Github</a>.</p>
</div>

<h3>Database Stored configuration:</h3>
<form id="cloud-upload-bucket">
	<label for="cloud-provider">Cloud Provider</label><br/>
	<select id="cloud-provider" name="provider" title="Cloud Provider" class="form-control">
		<option value="AWS">AWS</option>
		<option value="GCP">GCP</option>
	</select>

	<label for="cloudbucket">Bucket Name</label><br/>
	<input type="text" id="cloudbucket" name="bucketName" value="{bucketName}" title="Cloud Bucket" class="form-control input-lg" placeholder="Cloud Bucket"><br/>

	<label for="projectid">Project ID (GCP)</label><br/>
	<input type="text" id="projectid" name="project_id" value="{project_id}" title="Project ID" class="form-control input-lg" placeholder="sample-project"><br/>

	<button class="btn btn-primary" type="submit">Save</button>
</form>

<br><br>
<form id="cloud-upload-credentials">
	<label for="bucket">Credentials</label><br/>
	<div class="alert alert-warning">
		Configuring this plugin using the fields below is <strong>NOT recommended</strong>, as it can be a potential
		security issue. I highly recommend to use <strong>Environment Variables</strong>.
	</div>
	<input type="text" name="access_key_id" value="{access_key_id}" maxlength="20" title="Access Key ID" class="form-control input-lg" placeholder="Access Key ID"><br/>
	<input type="text" name="access_key_secret" value="{access_key_secret}" title="Secret Access Key" class="form-control input-lg" placeholder="Secret Access Key"><br/>
	<input type="text" name="client_email" value="{client_email}" title="Service Account Email (GCP)" class="form-control input-lg" placeholder="Email"><br/>
	<input type="text" name="private_key" value="{private_key}" title="Private Key (GCP)" class="form-control input-lg" placeholder="Key"><br/>

	<button class="btn btn-primary" type="submit">Save</button>
</form>

<script>
	$(document).ready(function () {

		$('#cloud-provider option[value="{provider}"]').prop('selected', true)

		$("#cloud-upload-bucket").on("submit", function (e) {
			e.preventDefault();
			save("cloudsettings", this);
		});

		$("#cloud-upload-credentials").on("submit", function (e) {
			e.preventDefault();
			var form = this;
			bootbox.confirm("Are you sure you wish to store your credentials for accessing Cloud Provider in the database?", function (confirm) {
				if (confirm) {
					save("credentials", form);
				}
			});
		});

		function save(type, form) {
			var data = {
				_csrf: '{csrf}' || $('#csrf_token').val()
			};

			var values = $(form).serializeArray();
			for (var i = 0, l = values.length; i < l; i++) {
				data[values[i].name] = values[i].value;
			}

			$.post('{forumPath}api/admin/plugins/cloud-uploads/' + type, data).done(function (response) {
				if (response) {
					ajaxify.refresh();
					app.alertSuccess(response);
				}
			}).fail(function (jqXHR, textStatus, errorThrown) {
				ajaxify.refresh();
				app.alertError(jqXHR.responseJSON ? jqXHR.responseJSON.error : 'Error saving!');
			});
		}
	});
</script>
