push:
	rsync -avz ./ --exclude '.git/' eferrer.info:~/public_html
