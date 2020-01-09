/**
 * @author xiaojue
 * @date 20190614
 * @fileoverview plugin化daruk core
 */
import KoaLogger = require('daruk-logger');
import Http = require('http');
import Https = require('https');
import Koa = require('koa');
import deepAssign = require('object-assign-deep');
import path = require('path');
import { join } from 'path';
import { PartialOptions } from '../../types/daruk_options';
import helpDecoratorClass from '../decorators/help_decorator_class';
import mockHttp from '../mock/http_server';
import { uRequire } from '../utils';
import getDefaultOptions from './daruk_default_options';
import Module from './module';

class Daruk extends Module {
  public plugins: { [key: string]: any };
  public name: string;
  public app: Koa;
  public httpServer: Http.Server | Https.Server;
  public constructor(name: string, options?: PartialOptions) {
    super();
    this.name = name;
    const rootPath = options.rootPath || path.dirname(require.main.filename);
    const defaultOptions = getDefaultOptions(rootPath, name, options.debug || false);
    this.options = deepAssign({}, defaultOptions, options);
    const customLogger = options.customLogger;
    // customLogger 可能是一个类，不能进行 deep assign
    delete options.customLogger;
    this.options = deepAssign({}, defaultOptions, options);
    // 还原被 delete 的 customLogger
    this.options.customLogger = options.customLogger = customLogger;

    // 初始化 logger
    this.logger = customLogger || new KoaLogger.logger(this.options.loggerOptions);
    // 用于保存 DarukLoader 加载的模块
    this.module = {};
    // 初始化装饰器与 daurk 实例之间的桥梁
    helpDecoratorClass.init(this);
    // 初始化内置插件
    this.plugins = {};
    // 监听 koa 的错误事件，输出日志
    if (this.options.serverType === 'koa') {
      this.app = new Koa();
    } else {
      throw new Error('only support koa server Type');
    }
    // tslint:disable-next-line
    const self = this;

    this.app.on('error', function handleKoaError(err: any) {
      self.prettyLog('[koa error] ' + (err.stack || err.message), { level: 'error' });
    });
  }
  /**
   * @desc 模拟 ctx，从而可以从非请求链路中得到 ctx
   * @param {Object, undefined} req - 配置模拟请求的 headers、query、url 等
   * @return Daruk.Context
   */
  public mockContext(req?: {}) {
    const { request, response } = mockHttp(req);
    // 使用 koa 的 createContext 方法创建一个 ctx
    const ctx = this.app.createContext(request, response);
    // 为模拟的 ctx 绑定 service
    ctx.module = this.module;
    return ctx;
  }
  /**
   * @desc 启动服务
   */
  public async listen(...args: any[]): Promise<Http.Server> {
    this.httpServer = this.app.listen(...args);
    this.emit('ready');
    return this.httpServer;
  }
  public async loadPlugin(paths: string[] = []) {
    await this.plugin('../plugins/wrapMiddlewareUse');
    await this.plugin('../plugins/exitHook');
    await this.plugin('../plugins/darukConfig');
    await this.plugin('../plugins/daruk_http_server_shutdown');
    await this.plugin('../plugins/router');
    await this.plugin('../plugins/timer');
    for (let path of paths) {
      await this.plugin(path);
    }
  }
  private async plugin(path: string) {
    const plugin = uRequire(join(__dirname, path));
    this.plugins[path] = await plugin(this);
  }
}

export default Daruk;
