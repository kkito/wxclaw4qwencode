import { Agent } from '@agentscope-ai/agentscope/agent';
import { Toolkit } from '@agentscope-ai/agentscope/tool';
import { CustomModel, CustomModelConfig } from '../model/custom-model.js';
import { WeixinBridge } from '../bridge/weixin-bridge.js';
import { loadConfig, Config } from '../config.js';
import { createLogger, getGlobalLogger, Logger } from '../logger.js';
import { SkillsManager } from '../skills/index.js';
import { SlashCommandRegistry } from '../slash-command/index.js';

export interface AgentRunnerConfig {
  model: CustomModelConfig;
  sysPrompt: string;
  weixin: {
    sendMessage: (to: string, text: string) => Promise<void>;
  };
  logger?: Logger;
  skillsManager?: SkillsManager;
  slashRegistry?: SlashCommandRegistry;
}

export class AgentRunner {
  private agent: Agent;
  private bridge: WeixinBridge;
  private logger: Logger;

  constructor(config: AgentRunnerConfig) {
    this.logger = config.logger || getGlobalLogger();

    // 创建模型客户端
    const model = new CustomModel(config.model);

    // 创建 Toolkit
    let toolkit: Toolkit;
    if (config.skillsManager) {
      // 通过 SkillsManager 创建 Toolkit（自动配置 skillDirs）
      toolkit = config.skillsManager.createToolkit();
    } else {
      // 没有 SkillsManager 时创建空 Toolkit
      toolkit = new Toolkit({ builtInSkillTool: false });
    }

    // 创建 Agent（传入 toolkit）
    this.agent = new Agent({
      name: 'weixin-assistant',
      sysPrompt: config.sysPrompt,
      model,
      toolkit,
      maxIters: 10,
    });

    // 创建桥接器
    this.bridge = new WeixinBridge({
      agent: this.agent,
      sendMessage: config.weixin.sendMessage,
      logger: this.logger,
      slashRegistry: config.slashRegistry,
    });
  }

  getBridge(): WeixinBridge {
    return this.bridge;
  }

  async start(): Promise<void> {
    this.logger.info('AgentRunner started');
  }

  async stop(): Promise<void> {
    this.logger.info('AgentRunner stopped');
  }
}

export interface AgentRunnerOptions {
  config?: Config;
  weixin: {
    sendMessage: (to: string, text: string) => Promise<void>;
  };
  logger?: Logger;
  skillsManager?: SkillsManager;
}

export async function createAgentRunner(options: AgentRunnerOptions): Promise<AgentRunner> {
  const config = options.config || loadConfig();

  // 如果传入了 logger，则设置为全局 logger
  if (options.logger) {
    // 设置全局 logger（供 WeixinBridge 使用）
  }

  const logger = options.logger || createLogger({ level: config.log.level, prefix: '[AgentRunner] ' });

  const runner = new AgentRunner({
    model: {
      baseUrl: config.agentscope.model.baseUrl,
      apiKey: config.agentscope.model.apiKey,
      modelName: config.agentscope.model.modelName,
    },
    sysPrompt: config.agentscope.sysPrompt,
    weixin: options.weixin,
    logger,
    skillsManager: options.skillsManager,
  });

  await runner.start();
  return runner;
}