const path = require('path')
const UglifyJsPlugin = require("uglifyjs-webpack-plugin")
const MiniCssExtractPlugin = require("mini-css-extract-plugin")
const OptimizeCSSAssetsPlugin = require("optimize-css-assets-webpack-plugin")
const HtmlWebpackPlugin = require('html-webpack-plugin')
const PreloadWebpackPlugin = require('preload-webpack-plugin')

const devMode = process.env.NODE_ENV !== 'production'

module.exports = {
  mode: devMode ? 'development' : 'production',
  entry: './src/game/index.js',
  output: {
    path: path.resolve('.git-deploy/'),
    filename: 'index.js',
    publicPath: '/'
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: "[name].css",
      chunkFilename: "[id].css"
    }),
    new HtmlWebpackPlugin({
      template: './src/index.html',
      warriors: 'assets/intro/cta.png'
    }),
    new PreloadWebpackPlugin({
      include: 'allAssets',
      fileWhitelist: [/plain-tile/],
      as: 'image',
      rel: 'prefetch',
    })
  ],
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: path.resolve('node_modules'),
        loader: 'babel-loader'
      },
      {
        test: /\.sass$/,
        use: [
          devMode ? 'style-loader' : MiniCssExtractPlugin.loader,
          'css-loader',
          'postcss-loader',
          'sass-loader',
        ],
      },
      {
        test: /cta\.png$/,
        use: [ 'url-loader?mimetype=image/png' ]
      },
      {
        test: /\.(png|jpg|gif)$/,
        exclude: [/cta\.png$/],
        use: [
          {
            loader: 'file-loader',
            options: {
              outputPath: 'game/images',
              name: devMode ? '[name].[ext]' : '[name]-[hash].[ext]'
            }
          }
        ]
      },
      {
        test: /\.(html)$/,
        use: {
          loader: 'html-loader'
        }
      }
    ]
  },
  optimization: {
    minimizer: [
      new UglifyJsPlugin({
        cache: true,
        parallel: true,
        sourceMap: true // set to true if you want JS source maps
      }),
      new OptimizeCSSAssetsPlugin({})
    ]
  }
}
