# Publishing new version

- Update version in `package.json`
- `git tag vx.x.x`
- `git push --tags`
- `docker buildx build --platform linux/amd64 -t wifidb/tileserver-gl:latest -t wifidb/tileserver-gl:[version] .`
- `docker push wifidb/tileserver-gl --all-tags`
- `npm publish --access public` or `node publish.js` 
- `node publish.js --no-publish`
- `cd light`
- `docker buildx build --platform linux/amd64 -t wifidb/tileserver-gl-light:latest -t wifidb/tileserver-gl-light:[version] .`
- `docker push wifidb/tileserver-gl-light --all-tags`
- `npm publish --access public`

