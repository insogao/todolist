
1) 配置文件（无需环境变量）
- 使用你的 `agent.config.json`（已准备好）里面内容是：

{
  "openai": {
    "baseURL": "https://api-inference.modelscope.cn/v1",
    "apiKey": "ms-b232dafe-eb72-48ea-8c83-4a1124dbe062",
    "model": "Qwen/Qwen3-Next-80B-A3B-Instruct"
  },
  "bocha": {
    "apiKey": "sk-902402d194974e4c90109f0fba31bd3b",
    "count": 5,
    "freshness": "noLimit",
    "summary": true
  }
}


connect_demo.md  这个文件展示了怎么连接大模型推理
search.md 这个文件描述了怎么用搜索引擎搜索

这两个文件都不是我期望的运行方式，只能说是可用给这个key跑通
我期望的是使用openai agent js的方式构造一个智能体，给他一个搜索工具，让他可以思考，搜索，得出结论。注意，我不希望是一个给搜索单独拆出来，分成多个llm执行的方案
参考地址 https://github.com/openai/openai-agents-js