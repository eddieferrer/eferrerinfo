push:
	rsync -avz --no-perms --no-owner --no-group ./ --exclude '.git/' eferrer.info:~/public_html
