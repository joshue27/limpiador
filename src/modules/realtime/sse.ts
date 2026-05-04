export const REALTIME_TOPICS = ['inbox', 'exports', 'notifications'] as const;
export type RealtimeTopic = (typeof REALTIME_TOPICS)[number];

const topicSet = new Set<string>(REALTIME_TOPICS);

export function parseRealtimeTopics(value: string | null): RealtimeTopic[] {
  const topics = value
    ?.split(',')
    .map((topic) => topic.trim())
    .filter((topic): topic is RealtimeTopic => topicSet.has(topic));

  return topics?.length ? topics : [...REALTIME_TOPICS];
}

export function formatSseEvent(input: { id?: string; event: string; data: unknown }): string {
  const lines = input.id ? [`id: ${input.id}`] : [];
  lines.push(`event: ${input.event}`);
  lines.push(`data: ${JSON.stringify(input.data)}`);
  return `${lines.join('\n')}\n\n`;
}
