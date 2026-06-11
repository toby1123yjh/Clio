import type { ChatMessageRecord, ChatMessageRole } from "@/src/shared/rpc";

const roleDisplayRank: Record<ChatMessageRole, number> = {
  user: 0,
  evidence: 1,
  assistant: 2,
};

export function compareChatMessagesForDisplay(left: ChatMessageRecord, right: ChatMessageRecord) {
  return (
    compareStrings(left.createdAt, right.createdAt) ||
    compareQueueOrder(left.queueOrder, right.queueOrder) ||
    compareStrings(messageTurnKey(left), messageTurnKey(right)) ||
    roleDisplayRank[left.role] - roleDisplayRank[right.role] ||
    compareStrings(left.id, right.id)
  );
}

function compareStrings(left: string, right: string) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareQueueOrder(left: number | undefined, right: number | undefined) {
  if (left === right) return 0;
  if (left === undefined) return -1;
  if (right === undefined) return 1;
  return left - right;
}

function messageTurnKey(message: ChatMessageRecord) {
  if (message.runId !== undefined && message.runId.length > 0) return message.runId;
  const evidenceMarkerIndex = message.id.indexOf(":evidence:");
  if (evidenceMarkerIndex >= 0) return message.id.slice(0, evidenceMarkerIndex);
  for (const suffix of [":assistant", ":user"]) {
    if (message.id.endsWith(suffix)) return message.id.slice(0, -suffix.length);
  }
  return message.id;
}
