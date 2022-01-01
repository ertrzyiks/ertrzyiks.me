require('dotenv').load()

const webpack = require('webpack')
const path = require('path')
const ExtractCssBlockPlugin = require('extract-css-block-webpack-plugin')
const MiniCssExtractPlugin = require("mini-css-extract-plugin")
const { WebpackManifestPlugin: ManifestPlugin } = require('webpack-manifest-plugin')

const publicAssetsPath = process.env.PUBLIC_ASSETS_PATH || '/'

module.exports = {
  mode: 'production',
  entry: {
    post: path.resolve(__dirname, './themes/nono/assets/post.js'),
    output: path.resolve(__dirname, './themes/nono/assets/index.js'),
    raven: path.resolve(__dirname, './themes/nono/assets/raven.js')
  },
  output: {
    path: path.resolve(__dirname, './themes/nono/source/'),
    filename: 'js/[name]-[hash].js'
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['env']
          }
        }
      },
      {
        test: /\.sass$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader?minimize=true',
          'postcss-loader',
          'sass-loader'
        ]
      },
      {
        test: /\.(eot|svg|ttf|woff|woff2)$/,
        use: {
          loader: 'file-loader',
          options: {
            outputPath: 'css/fonts/',
            publicPath: process.env.NODE_ENV == 'production' ? '/' : ''
          }
        }
      }
    ]
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: 'css/compiled-[hash].css'
    }),
    new ExtractCssBlockPlugin(),
    new webpack.DefinePlugin({
      "process.env": {
        SENTRY_PUBLIC_DSN: JSON.stringify(process.env.SENTRY_PUBLIC_DSN),
        NODE_ENV: JSON.stringify(process.env.NODE_ENV || 'development')
      }
    }),
    new ManifestPlugin({
      fileName: '../assets.json',
      writeToFileEmit: true,
      publicPath: publicAssetsPath,
      seed: {
        'fallback.css': publicAssetsPath + 'css/fallback.css'
      }
    })
  ]
}
