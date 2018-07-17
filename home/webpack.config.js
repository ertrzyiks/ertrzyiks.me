const webpack = require('webpack')
const path = require('path')
const ExtractTextPlugin = require('extract-text-webpack-plugin')
const UglifyJSPlugin = require('uglifyjs-webpack-plugin')
const ManifestPlugin = require('webpack-manifest-plugin')

const publicAssetsPath = process.env.PUBLIC_ASSETS_PATH || '/'

module.exports = {
  entry: {
    main: path.resolve(__dirname, './sass/main.sass')
  },
  output: {
    path: path.resolve(__dirname, './'),
    filename: 'js/[name].js'
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
      filename: 'css/main.css'
    }),
    new UglifyJSPlugin(),
    new webpack.DefinePlugin({
      "process.env": {
        NODE_ENV: JSON.stringify(process.env.NODE_ENV || 'development')
      }
    }),
    new ManifestPlugin({
      fileName: '../assets.json',
      writeToFileEmit: true,
      publicPath: publicAssetsPath
    })
  ]
}
