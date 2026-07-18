import type { ChatOpts, Msg, Provider, ToolSchema, Turn } from '../types.js';

type AnthropicContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export class AnthropicProvider implements Provider {
  readonly name = 'anthropic';

  constructor(
    private readonly model = 'claude-sonnet-5',
    private readonly apiKey = process.env.ANTHROPIC_API_KEY,
  ) {
    if (!this.apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  }

  async chat(messages: Msg[], tools: ToolSchema[], opts: ChatOpts = {}): Promise<Turn> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: this.apiKey });

    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const conv: { role: 'user' | 'assistant'; content: AnthropicContent[] | string }[] = [];
    for (const m of messages) {
      if (m.role === 'system') continue;
      if (m.role === 'user') {
        conv.push({ role: 'user', content: m.content });
      } else if (m.role === 'assistant') {
        const content: AnthropicContent[] = [];
        if (m.content) content.push({ type: 'text', text: m.content });
        for (const t of m.toolCalls ?? []) {
          content.push({ type: 'tool_use', id: t.id, name: t.name, input: t.args });
        }
        if (content.length) conv.push({ role: 'assistant', content });
      } else {
        // tool results are user-role content blocks in the Anthropic API
        const prev = conv[conv.length - 1];
        const block: AnthropicContent = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
        if (prev && prev.role === 'user' && Array.isArray(prev.content)) {
          prev.content.push(block);
        } else {
          conv.push({ role: 'user', content: [block] });
        }
      }
    }

    const res = await client.messages.create({
      model: this.model,
      max_tokens: opts.maxTokens ?? 8192,
      ...(system ? { system } : {}),
      messages: conv as never,
      ...(tools.length
        ? {
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.parameters as never,
            })),
          }
        : {}),
    });

    let text: string | null = null;
    const toolCalls = [];
    for (const block of res.content) {
      if (block.type === 'text') text = (text ?? '') + block.text;
      if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id, name: block.name, args: block.input as Record<string, unknown> });
      }
    }
    return {
      text,
      toolCalls,
      usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
    };
  }
}
