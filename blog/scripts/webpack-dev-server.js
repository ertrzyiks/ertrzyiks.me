(function (startWebpackDevServer) {
  if (hexo.env.args.watch) {
    startWebpackDevServer();
  }
})(function () {
  const webpack = require("webpack");
  const WebpackDevServer = require("webpack-dev-server");
  const config = require("../webpack.config");
  console.log("Starting the dev web server...");
  const port = 8080;

  const options = {
    // stats: { colors: true }
  };

  const server = new WebpackDevServer(
    webpack({ ...config, mode: "development" }),
    options
  );

  server.listen(port, "localhost", function (err) {
    if (err) {
      console.log(err);
    }
    console.log("WebpackDevServer listening at localhost:", port);
  });
});
