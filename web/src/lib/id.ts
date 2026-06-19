let messageIdCounter = Date.now()

export function nextMessageId(): number {
  return messageIdCounter++
}
