docker stop webtycoon-jjiill
docker run -i --rm --volume=/opt/uweb-jjiill:/usr/src/app --workdir=/usr/src/app --name=webtycoon-jjiill --network=webtycoon-network node npm run build
docker run -d -i --rm \
	    --volume=/opt/uweb-jjiill:/usr/src/app \
	    --volume=/opt/uweb-back:/opt/uweb-back \
	    --volume=/var/run/docker.sock:/var/run/docker.sock \
	    --workdir=/usr/src/app \
	    --name=webtycoon-jjiill \
	    --env-file env.list \
	    --network=webtycoon-network \
	    node npm run server
