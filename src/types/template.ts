export interface MessageTemplate {
  id: string;
  title: string;
  tag: string;
  content: string;
  isDefault?: boolean;
  createdAt?: number;
  updatedAt?: number;
}
