let messageIdCounter = Date.now()

export function nextMessageId(): string {
  return String(messageIdCounter++)
}
