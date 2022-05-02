# Publishing new version

cd [tileserver-gl dir]
Update version in `package.json`
git tag vx.x.x
git push --tags
docker build --no-cache -t wifidb/tileserver-gl:latest .
docker push wifidb/tileserver-gl:latest
npm publish --access public (or `node publish.js` )
node publish.js --no-publish
cd light
docker build --no-cache -t wifidb/tileserver-gl-light:latest .
docker push wifidb/tileserver-gl-light:latest
npm publish --access public

# Publishing new version using github testAndPublish workflow

cd [tileserver-gl] dir
git tag vx.x.x
git push --tags
[Workflow will build and push docker and npm]