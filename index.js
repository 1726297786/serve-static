/*!
 * serve-static 静态服务 
 * Copyright(c) 2010 Sencha Inc.2010年拥有版权归属Sencha Inc
 * Copyright(c) 2011 TJ Holowaychuk
 * Copyright(c) 2014-2016 Douglas Christopher Wilson
 * MIT Licensed MIT许可证：特此授予任何人获得本软件和相关文档文件（“软件”）的副本的权利，以无限制地处理本软件，包括但不限于使用，复制，修改，合并，发布，分发，再许可和/或出售本软件的副本，并允许本软件提供给本公司的人员遵守以下条件：上述版权声明和本许可声明应包含在本软件的所有副本或主要部分中。本软件按“原样”提供，不作任何明示或暗示的保证，包括但不限于对适销性，特定用途适用性和不侵权的保证。在任何情况下，作者或版权所有者均不对任何索赔，损害或其他责任负责，无论是因合同，侵权或其他原因，由本软件或本软件的使用或其他交易引起或与之相关的行为。软件。
 */

'use strict' //严格模式

/**
 * Module dependencies. 模块依赖的生产环境
 * @private @private作用范围只能在自身类 @protected作用范围在自身类和继承自己的子类，什么都不写，默认是此属性。 @public作用范围最大，在任何地方
 */

var encodeUrl = require('encodeurl')//引用第三方API将转化中文
var escapeHtml = require('escape-html')//引用转义特殊字符API
var parseUrl = require('parseurl')//解析给定请求对象的URL（查看req.url属性）并返回结果。结果与url.parseNode.js内核相同。req在req.url不改变的地方多次调用这个函数将返回一个缓存的解析对象，而不是再次解析。
var resolve = require('path').resolve//path.resolve([from ...], to) 将参数 to 位置的字符解析到一个绝对路径里。
var send = require('send')//Send是一个用于从文件系统流式传输文件的库，作为支持部分响应（范围），条件GET协商（If-Match，If-Unmodified-Since，If-None-Match，If-Modified-Since）的http响应。高测试覆盖率以及可以在您的应用程序或框架中采取适当行动的细化事件。希望提供映射到URL的整个文件夹？尝试静态服务。
var url = require('url')//加载url模块

/**
 * Module exports 每一个node.js执行文件，都自动创建一个module对象，同时，module对象会创建一个叫exports的属性，初始化的值是 {}
 * @public
 */

module.exports = serveStatic//将serveStatic的属性作为module的exports属性的值
module.exports.mime = send.mime //将send的mime属性作为exports的mime属性的值

/**
 * @param {string} root 路径字符串参数
 * @param {object} [options] 参数{对象} [选项]
 * @return {function} 返回的函数
 * @public
 */

function serveStatic (root, options) {
  if (!root) {
    throw new TypeError('root path required')//非root扔出一个错误信息
  }

  if (typeof root !== 'string') {
    throw new TypeError('root path must be a string')//非字符串格式扔出一个错误信息
  }

  // copy options object
  var opts = Object.create(options || null)//若options不为空，则创建一个原形继承对象，若为空，则创建一个空对象

  // fall-through switch语句中的跳过下一跳命令
  var fallthrough = opts.fallthrough !== false//不为false

  // default redirect 默认的重定向
  var redirect = opts.redirect !== false //不为false

  // headers listener 头监听
  var setHeaders = opts.setHeaders

  if (setHeaders && typeof setHeaders !== 'function') {
    throw new TypeError('option setHeaders must be function')//如果头监听和头监听的类型不使函数则报错
  }

  // setup options for send 为传输创建属性
  opts.maxage = opts.maxage || opts.maxAge || 0//若opts.maxage不为空则为opts.maxage，若为空则看opts.maxAge若为空为0，不为空为opts.maxAge
  opts.root = resolve(root)//解析路径

  // construct directory listener 创建目录监听
  var onDirectory = redirect
    ? createRedirectDirectoryListener()
    : createNotFoundDirectoryListener()//若redirect不为空或false，则为createRedirectDirectoryListener()，否则为createNotFoundDirectoryListener()

  return function serveStatic (req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (fallthrough) {
        return next()
      }

      // method not allowed 方法不被允许
      res.statusCode = 405  //当客户端访问受口令保护时，服务器端会发送401状态码
      res.setHeader('Allow', 'GET, HEAD')
      res.setHeader('Content-Length', '0')
      res.end()
      return
    }

    var forwardError = !fallthrough
    var originalUrl = parseUrl.original(req)
    var path = parseUrl(req).pathname

    // make sure redirect occurs at mount 确保重定向发生
    if (path === '/' && originalUrl.pathname.substr(-1) !== '/') {
      path = ''
    }

    // create send stream 创造发送流
    var stream = send(req, path, opts)

    // add directory handler 目录添加处理程序
    stream.on('directory', onDirectory)

    // add headers listener 添加头监听
    if (setHeaders) {
      stream.on('headers', setHeaders)
    }

    // add file listener for fallthrough 对fallthrough添加监听器
    if (fallthrough) {
      stream.on('file', function onFile () {
        // once file is determined, always forward error
        forwardError = true
      })
    }

    // forward errors 提交错误
    stream.on('error', function error (err) {
      if (forwardError || !(err.statusCode < 500)) {
        next(err)
        return
      }

      next()
    })

    // pipe 通过管道连接流
    stream.pipe(res)
  }
}

/**
 * Collapse all leading slashes into a single slash
 * @private
 */
function collapseLeadingSlashes (str) {
  for (var i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) !== 0x2f /* / */) {
      break
    }
  }

  return i > 1
    ? '/' + str.substr(i)
    : str
}

 /**
 * Create a minimal HTML document. 创建小HTML文档
 *
 * @param {string} title  标题字符串参数
 * @param {string} body
 * @private
 */

function createHtmlDocument (title, body) {
  return '<!DOCTYPE html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '<meta charset="utf-8">\n' +
    '<title>' + title + '</title>\n' +
    '</head>\n' +
    '<body>\n' +
    '<pre>' + body + '</pre>\n' +
    '</body>\n'
}

/**
 * Create a directory listener that just 404s. 创建一个目录监听者
 * @private
 */

function createNotFoundDirectoryListener () {
  return function notFound () {
    this.error(404)
  }
}

/**
 * Create a directory listener that performs a redirect.创建执行重定向的目录监听器
 * @private
 */

function createRedirectDirectoryListener () {
  return function redirect (res) {
    if (this.hasTrailingSlash()) {
      this.error(404)
      return
    }

    // get original URL 得到原始url
    var originalUrl = parseUrl.original(this.req)

    // append trailing slash 生成的Url末尾添加斜线
    originalUrl.path = null
    originalUrl.pathname = collapseLeadingSlashes(originalUrl.pathname + '/')

    // reformat the URL 格式化url
    var loc = encodeUrl(url.format(originalUrl))
    var doc = createHtmlDocument('Redirecting', 'Redirecting to <a href="' + escapeHtml(loc) + '">' +
      escapeHtml(loc) + '</a>')

    // send redirect response 发送重定向响应
    res.statusCode = 301
    res.setHeader('Content-Type', 'text/html; charset=UTF-8')
    res.setHeader('Content-Length', Buffer.byteLength(doc))
    res.setHeader('Content-Security-Policy', "default-src 'self'")
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Location', loc)
    res.end(doc)
  }
}
