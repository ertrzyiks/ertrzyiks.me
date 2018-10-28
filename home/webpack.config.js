const path = require('path')
const webpack = require('webpack')
const UglifyJsPlugin = require("uglifyjs-webpack-plugin")
const MiniCssExtractPlugin = require("mini-css-extract-plugin")
const OptimizeCSSAssetsPlugin = require("optimize-css-assets-webpack-plugin")
const HtmlWebpackPlugin = require('html-webpack-plugin')
const PreloadWebpackPlugin = require('preload-webpack-plugin')
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer')

const devMode = process.env.NODE_ENV !== 'production'
const analyzeBundle = !!process.env.ANALYZE

const toRemove = [
  'pixi.js/lib/deprecation.js',
  'pixi.js/lib/mesh',
  'pixi.js/lib/particles',
  'pixi.js/lib/core/text/',
  'pixi.js/lib/filters/colormatrix',
  'pixi.js/lib/filters/blur',
  'pixi.js/lib/extras/TilingSprite',
  'pixi.js/lib/extras/BitmapText',
  'pixi-viewport/dist/decelerate.js',
  'pixi-viewport/dist/bounce.js',
  'pixi-viewport/dist/mouse-edges.js',
  'pixi-viewport/dist/snap-zoom.js',
  'pixi-viewport/dist/wheel.js',
  'pixi-viewport/dist/follow.js',
  'pixi-viewport/dist/pinch.js',
  'pixi-viewport/dist/snap.js',
  'pixi-viewport/dist/clamp-zoom.js',
]

module.exports = {
  mode: devMode ? 'development' : 'production',
  entry: './src/game/index.ts',
  devtool: 'cheap-module-source-map',
  output: {
    path: path.resolve('.git-deploy/'),
    filename: devMode ? 'index.js' : 'index-[contenthash].js',
    publicPath: '/'
  },
  plugins:
    toRemove.map(pattern => {
      return new webpack.NormalModuleReplacementPlugin(new RegExp(pattern), require.resolve('node-noop'))
    })
    .concat([
      new webpack.NormalModuleReplacementPlugin(
        /pixi\.js\/lib\/core\/text\//,
        require.resolve('node-noop')
      ),
      new webpack.NormalModuleReplacementPlugin(
        /pixi\.js\/lib\/mesh/,
        require.resolve('node-noop')
      ),
      new webpack.HashedModuleIdsPlugin(),
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': '"production"'
      }),
      new MiniCssExtractPlugin({
        filename: devMode ? '[name].css' : '[name]-[contenthash].css',
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
    ])
    .concat(analyzeBundle ? [new BundleAnalyzerPlugin()] : []),
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: path.resolve('node_modules'),
        loader: 'babel-loader'
      },
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
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
  resolve: {
    extensions: ['.ts', '.js']
  },
  optimization: {
    minimizer: [
      new UglifyJsPlugin({
        cache: true,
        parallel: true,
        sourceMap: true // set to true if you want JS source maps
      }),
      new OptimizeCSSAssetsPlugin({})
    ],
    splitChunks: {
      maxAsyncRequests: 1
    }
  }
}
