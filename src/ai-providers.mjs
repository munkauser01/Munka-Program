// Fixed choices; no arbitrary URLs, models, tools or automatic provider fallback.
export const AI_PROVIDERS = Object.freeze({
  managed: Object.freeze({label:'Munka AI · GPT-5.6 Luna',name:'OpenAI through Munka',model:'gpt-5.6-luna',description:'Three daily prompts, included with your Munka account.'}),
  ollama: Object.freeze({ name: 'Ollama (local)', model: 'llama3.2:3b',
    label: 'Ollama · local, no API key',
    description: 'Runs on this PC through Ollama at 127.0.0.1:11434. No account or API key is sent. Install Ollama and pull a local model first.' }),
  gemini: Object.freeze({ name: 'Google Gemini', model: 'gemini-2.5-flash-lite',
    label: 'Gemini Flash-Lite · free tier available',
    description: 'Limited free tier for eligible accounts. Google may use free-tier content to improve its products. Paid pricing: $0.10 input / $0.40 output per million tokens. Your Google account controls eligibility and billing.' }),
  openai: Object.freeze({ name: 'OpenAI', model: 'gpt-5.4-nano-2026-03-17',
    label: 'GPT-5.4 nano · low-cost paid API',
    description: '$0.20 input / $1.25 output per million tokens. Requires API billing, separate from a ChatGPT subscription. Munka disables response storage; provider retention policies still apply.' }),
});
