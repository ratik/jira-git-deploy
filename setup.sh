#docker run -i --rm --volume=/opt/uweb-jjiill:/usr/src/app --workdir=/usr/src/app --name=webtycoon-jjiill --network=webtycoon-network node npm run watch-server
#docker run -i --rm --volume=/opt/uweb-jjiill:/usr/src/app --workdir=/usr/src/app --name=webtycoon-jjiill --network=webtycoon-network node npm run build
docker run -i --rm --volume=/opt/uweb-jjiill:/usr/src/app --workdir=/usr/src/app --name=webtycoon-jjiill --network=webtycoon-network node npm i @types/aha
docker run -i --rm --volume=/opt/uweb-jjiill:/usr/src/app --workdir=/usr/src/app --name=webtycoon-jjiill --network=webtycoon-network node npm i aha
