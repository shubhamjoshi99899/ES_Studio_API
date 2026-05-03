export interface PublishPostParams {
  text: string;
  mediaUrls: string[];
  scheduledAt: undefined;
}

export interface IPlatformPublishAdapter {
  publishPost(
    externalProfileId: string,
    params: PublishPostParams,
  ): Promise<{ platformPostId: string }>;
}
