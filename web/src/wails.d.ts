declare module '@/wailsjs/go/bindings/*' {
  export const Register: (...args: any[]) => Promise<any>
  export const Login: (...args: any[]) => Promise<any>
  export const Refresh: (...args: any[]) => Promise<any>
  export const Me: (...args: any[]) => Promise<any>
  export const Get: (...args: any[]) => Promise<any>
  export const List: (...args: any[]) => Promise<any>
  export const Create: (...args: any[]) => Promise<any>
  export const GetByID: (...args: any[]) => Promise<any>
  export const Update: (...args: any[]) => Promise<any>
  export const Delete: (...args: any[]) => Promise<any>
  export const GetTags: (...args: any[]) => Promise<any>
  export const ReplaceTags: (...args: any[]) => Promise<any>
  export const ListByContact: (...args: any[]) => Promise<any>
  export const GetGraph: (...args: any[]) => Promise<any>
  export const GetRelations: (...args: any[]) => Promise<any>
  export const CreateRelation: (...args: any[]) => Promise<any>
  export const DeleteRelation: (...args: any[]) => Promise<any>
  export const ExportJSON: (...args: any[]) => Promise<any>
  export const ImportJSON: (...args: any[]) => Promise<any>
  export const Summary: (...args: any[]) => Promise<any>
  export const ListProviders: (...args: any[]) => Promise<any>
  export const SaveProvider: (...args: any[]) => Promise<any>
  export const ActivateProvider: (...args: any[]) => Promise<any>
  export const TestConnection: (...args: any[]) => Promise<any>
  export const ListConversations: (...args: any[]) => Promise<any>
  export const CreateConversation: (...args: any[]) => Promise<any>
  export const GetMessages: (...args: any[]) => Promise<any>
  export const DeleteConversation: (...args: any[]) => Promise<any>
  export const Chat: (...args: any[]) => Promise<any>
  export const AnalyzeRelationship: (...args: any[]) => Promise<any>
  export const AnalyzeEvent: (...args: any[]) => Promise<any>
  export const AnalyzeComprehensive: (...args: any[]) => Promise<any>
  export const ListPresets: (...args: any[]) => Promise<any>
  export const Version: (...args: any[]) => Promise<any>
  export const Platform: (...args: any[]) => Promise<any>
  export const Arch: (...args: any[]) => Promise<any>
  export const DataDir: (...args: any[]) => Promise<any>
  export const DatabasePath: (...args: any[]) => Promise<any>
  export const OpenDataDir: (...args: any[]) => Promise<any>
  export const ToggleStatus: (...args: any[]) => Promise<any>
  export const SyncToEvent: (...args: any[]) => Promise<any>
  export const Switch: (...args: any[]) => Promise<any>
  export const GetDefault: (...args: any[]) => Promise<any>
}

declare namespace bindings {
  type ListContactsInput = any
  type CreateContactInput = any
  type CreateTagInput = any
  type UpdateTagInput = any
  type CreateInteractionInput = any
  type CreateReminderInput = any
  type UpdateReminderInput = any
  type CreateRelationInput = any
  type ListEventsInput = any
  type CreateEventInput = any
  type CreateTodoInput = any
  type ListTransactionsInput = any
  type CreateTransactionInput = any
  type SaveProviderInput = any
  type AnalyzeComprehensiveInput = any
}

declare module '@/wailsjs/runtime/runtime' {
  export function EventsOn(eventName: string, callback: (...args: any[]) => void): () => void
  export function WindowMinimise(): Promise<void>
  export function WindowToggleMaximise(): Promise<void>
  export function WindowClose(): Promise<void>
  export function WindowIsMaximised(): Promise<boolean>
  export function WindowUnmaximise(): Promise<void>
  export function Quit(): Promise<void>
}
