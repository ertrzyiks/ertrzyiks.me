const path = require('path')
const webpack = require('webpack')
const MiniCssExtractPlugin = require("mini-css-extract-plugin")
const HtmlWebpackPlugin = require('html-webpack-plugin')
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer')

const devMode = process.env.NODE_ENV !== 'production'
const analyzeBundle = !!process.env.ANALYZE


module.exports = {
  mode: devMode ? 'development' : 'production',
  entry: {
    index: [
      'core-js/modules/es.promise',
      'core-js/modules/es.array.iterator',
      './src/game/index.ts',
    ]
  },
  devtool: 'cheap-module-source-map',
  output: {
    path: path.resolve('.git-deploy/'),
    filename: devMode ? '[name].js' : '[name]-[contenthash].js',
    publicPath: '/'
  },
  plugins: []
    .concat([
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': '"production"'
      }),
      new MiniCssExtractPlugin({
        filename: devMode ? '[name].css' : '[name]-[contenthash].css',
        chunkFilename: "[id].css"
      }),
      new HtmlWebpackPlugin({
        template: './src/index.html',
        warriors: 'assets/intro/cta.png',
        excludeChunks: ['editor']
      })
    ])
    .concat(analyzeBundle ? [new BundleAnalyzerPlugin()] : []),
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          'babel-loader'
        ],
        exclude: /node_modules/
      },
      {
        test: /\.jsx?$/,
        use: {
          loader: 'babel-loader',
          options: {
            babelrc: true,
            extends: path.join(__dirname + '/.babelrc'),
            cacheDirectory: true
          }
        },
        exclude: /node_modules(?!\/pixi-viewport)/
      },
      {
        test: /\.css$/,
        use: [
          devMode ? 'style-loader' : MiniCssExtractPlugin.loader,
          'css-loader',
          'postcss-loader'
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
  resolve: {
    extensions: ['.ts', '.js']
  },
  optimization: {
    splitChunks: {
      maxAsyncRequests: 1
    }
  }
}
