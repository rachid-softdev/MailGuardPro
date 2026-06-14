export interface UndoToastItem {
  id: string;
  message: string;
  actionLabel: string;
  onAction: () => Promise<void> | void;
  expiresAt: Date;
  onExpire: () => void;
}
