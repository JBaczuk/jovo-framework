import {ActionSet, BaseApp, Extensible, ExtensibleConfig, HandleRequest, Jovo, Platform, RequestBuilder, ResponseBuilder, TestSuite, Log} from 'jovo-core';
import {Cards, CorePlatformRequestBuilder, CorePlatformResponseBuilder, CorePlatformApp, CorePlatformCore} from '.';
import _get = require('lodash.get');
import _merge = require('lodash.merge');
import _set = require('lodash.set');

export interface Config extends ExtensibleConfig {
  handlers?: any;
}

export class CorePlatform extends Extensible implements Platform {
  requestBuilder: CorePlatformRequestBuilder = new CorePlatformRequestBuilder();
  responseBuilder: CorePlatformResponseBuilder = new CorePlatformResponseBuilder();

  config: Config = {
    enabled: true,
  };

  constructor(config?: ExtensibleConfig) {
    super(config);

    if (config) {
      this.config = _merge(this.config, config);
    }

    this.actionSet = new ActionSet(
      [
        '$init',
        '$request',
        '$session',
        '$user',
        '$type',
        '$asr',
        '$nlu',
        '$inputs',
        '$tts.before',
        '$tts',
        '$output',
        '$response',
      ],
      this,
    );
  }

  getAppType(): string {
    return 'CorePlatformApp';
  }

  install(app: BaseApp): void {
    app.$platform.set(this.constructor.name, this);
    app.middleware('request')!.use(this.request.bind(this));
    app.middleware('platform.init')!.use(this.initialize.bind(this));
    app.middleware('asr')!.use(this.asr.bind(this));
    app.middleware('nlu')!.use(this.nlu.bind(this));
    app.middleware('before.tts')!.use(this.beforeTTS.bind(this));
    app.middleware('tts')!.use(this.tts.bind(this));
    app.middleware('platform.output')!.use(this.output.bind(this));
    app.middleware('response')!.use(this.response.bind(this));

    // app.use(new InUserDb());

    this.use(new CorePlatformCore(), new Cards());

    Jovo.prototype.$corePlatformApp = undefined;
    Jovo.prototype.corePlatformApp = function() {
      if (this.constructor.name !== 'CorePlatformApp') {
        throw Error(`Can't handle request. Please use this.isCorePlatformApp()`);
      }
      return this as CorePlatformApp;
    };
    Jovo.prototype.isCorePlatformApp = function() {
      return this.constructor.name === 'CorePlatformApp';
    };

    Jovo.prototype.action = function(key: string, value: any) {
      const actions = this.$output.actions || [];

      actions.push({ key, value });
      this.$output.actions = actions;

      return this;
    };
  }

  async request(handleRequest: HandleRequest) {
    Log.verbose('--------------------------------------------------------------');
    Log.verbose('[CorePlatform] { request } ');
    if (handleRequest.host.$request.audio) {
      const audioData = handleRequest.host.$request.audio.data;
      // handleRequest.host.$request.audio.raw = audioData;
      handleRequest.host.$request.audio.data = this.getSamplesFromAudio(audioData);
    }
  }

  async initialize(handleRequest: HandleRequest) {
    Log.verbose('[CorePlatform] { platform.init }');
    handleRequest.platformClazz = CorePlatformApp;
    await this.middleware('$init')!.run(handleRequest);

    if (!handleRequest.jovo || handleRequest.jovo.constructor.name !== 'CorePlatformApp') {
      return Promise.resolve();
    }

    await this.middleware('$request')!.run(handleRequest.jovo);
    await this.middleware('$type')!.run(handleRequest.jovo);
    await this.middleware('$session')!.run(handleRequest.jovo);

    if (this.config.handlers) {
      _set(
        handleRequest.app,
        'config.handlers',
        _merge(_get(handleRequest.app, 'config.handlers'), this.config.handlers),
      );
    }
  }

  async asr(handleRequest: HandleRequest) {
    if (!handleRequest.jovo || handleRequest.jovo.constructor.name !== 'CorePlatformApp') {
      return Promise.resolve();
    }
    Log.verbose('[CorePlatform] { asr }');
    await this.middleware('$asr')!.run(handleRequest.jovo);
  }

  async nlu(handleRequest: HandleRequest) {
    if (!handleRequest.jovo || handleRequest.jovo.constructor.name !== 'CorePlatformApp') {
      return Promise.resolve();
    }
    Log.verbose('[CorePlatform] { nlu }');
    await this.middleware('$nlu')!.run(handleRequest.jovo);
    await this.middleware('$inputs')!.run(handleRequest.jovo);
  }

  async beforeTTS(handleRequest: HandleRequest) {
    if (!handleRequest.jovo || handleRequest.jovo.constructor.name !== 'CorePlatformApp') {
      return Promise.resolve();
    }
    Log.verbose('[CorePlatform] { before.tts }');
    await this.middleware('$tts.before')!.run(handleRequest.jovo);
  }

  async tts(handleRequest: HandleRequest) {
    if (!handleRequest.jovo || handleRequest.jovo.constructor.name !== 'CorePlatformApp') {
      return Promise.resolve();
    }
    Log.verbose('[CorePlatform] { tts }');
    await this.middleware('$tts')!.run(handleRequest.jovo);
  }

  async output(handleRequest: HandleRequest) {
    if (!handleRequest.jovo || handleRequest.jovo.constructor.name !== 'CorePlatformApp') {
      return Promise.resolve();
    }
    Log.verbose('[CorePlatform] { platform.output }');
    await this.middleware('$output')!.run(handleRequest.jovo);
  }

  async response(handleRequest: HandleRequest) {
    if (!handleRequest.jovo || handleRequest.jovo.constructor.name !== 'CorePlatformApp') {
      return Promise.resolve();
    }
    Log.verbose('[CorePlatform] { response }');
    await this.middleware('$response')!.run(handleRequest.jovo);

    // handleRequest.jovo.$response = handleRequest.jovo.$rawResponseJson ? this.responseBuilder.create(handleRequest.jovo.$rawResponseJson) : handleRequest.jovo.$response;
    await handleRequest.host.setResponse(handleRequest.jovo.$response);
  }

  makeTestSuite(): TestSuite<RequestBuilder, ResponseBuilder> {
    return new TestSuite(new CorePlatformRequestBuilder(), new CorePlatformResponseBuilder());
  }

  uninstall(app: BaseApp): void {}

  private getSamplesFromAudio(base64: string): Float32Array {
    const binaryBuffer = Buffer.from(base64, 'base64').toString('binary');
    const length = binaryBuffer.length / Float32Array.BYTES_PER_ELEMENT;
    const view = new DataView(new ArrayBuffer(Float32Array.BYTES_PER_ELEMENT));
    const samples = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const p = i * 4;
      view.setUint8(0, binaryBuffer.charCodeAt(p));
      view.setUint8(1, binaryBuffer.charCodeAt(p + 1));
      view.setUint8(2, binaryBuffer.charCodeAt(p + 2));
      view.setUint8(3, binaryBuffer.charCodeAt(p + 3));
      samples[i] = view.getFloat32(0, true);
    }
    return samples;
  }
}
