import { Agent } from '@agentscope-ai/agentscope/agent';
import { CustomModel, CustomModelConfig } from '../model/custom-model';
import { WeixinBridge } from '../bridge/weixin-bridge';
import { loadConfig, Config } from '../config';

export interface AgentRunnerConfig {
  model: CustomModelConfig;
  sysPrompt: string;
  weixin: {
    sendMessage: (to: string, text: string) => Promise<void>;
  };
}

export class AgentRunner {
  private agent: Agent;
  private bridge: WeixinBridge;

  constructor(config: AgentRunnerConfig) {
    // 创建模型客户端
    const model = new CustomModel(config.model);

    // 创建 Agent
    this.agent = new Agent({
      name: 'weixin-assistant',
      sysPrompt: config.sysPrompt,
      model,
      maxIters: 10,
    });

    // 创建桥接器
    this.bridge = new WeixinBridge({
      agent: this.agent,
      sendMessage: config.weixin.sendMessage,
    });
  }

  getBridge(): WeixinBridge {
    return this.bridge;
  }

  async start(): Promise<void> {
    console.log('AgentRunner started');
  }

  async stop(): Promise<void> {
    console.log('AgentRunner stopped');
  }
}

export interface AgentRunnerOptions {
  config?: Config;
  weixin: {
    sendMessage: (to: string, text: string) => Promise<void>;
  };
}

export async function createAgentRunner(options: AgentRunnerOptions): Promise<AgentRunner> {
  const config = options.config || loadConfig();

  const runner = new AgentRunner({
    model: {
      baseUrl: config.agentscope.model.baseUrl,
      apiKey: config.agentscope.model.apiKey,
      modelName: config.agentscope.model.modelName,
    },
    sysPrompt: config.agentscope.sysPrompt,
    weixin: options.weixin,
  });

  await runner.start();
  return runner;
}