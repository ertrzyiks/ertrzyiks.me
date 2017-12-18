require('dotenv').load()

const webpack = require('webpack')
const path = require('path')
const ExtractCssBlockPlugin = require('extract-css-block-webpack-plugin')
const ExtractTextPlugin = require('extract-text-webpack-plugin')
const UglifyJSPlugin = require('uglifyjs-webpack-plugin')
const ManifestPlugin = require('webpack-manifest-plugin')

const publicAssetsPath = process.env.PUBLIC_ASSETS_PATH || '/'

module.exports = {
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
    loaders: [
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
        use: ExtractTextPlugin.extract({ use:[
          'css-loader?minimize=true',
          'postcss-loader',
          'sass-loader'
        ], fallback: 'style-loader' })
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
    new ExtractTextPlugin({
      filename: 'css/compiled-[hash].css'
    }),
    new ExtractCssBlockPlugin(),
    new UglifyJSPlugin(),
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
