export class PostStatusChangedEvent {
  workspaceId: string;
  postId: string;
  from: string;
  to: string;
  triggeredBy: string;

  constructor(data: PostStatusChangedEvent) {
    Object.assign(this, data);
  }
}
