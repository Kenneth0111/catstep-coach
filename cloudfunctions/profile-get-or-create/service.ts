export interface UserProfile {
  openid: string;
  growth: number;
  createdAt: string;
}

export interface ProfileRepository {
  findByOpenid(openid: string): Promise<UserProfile | null>;
  save(profile: UserProfile): Promise<UserProfile>;
}

export async function getOrCreateProfile(
  openid: string,
  repository: ProfileRepository,
  now: () => Date,
): Promise<UserProfile> {
  if (!openid.trim()) {
    throw new Error('openid is required');
  }

  const existing = await repository.findByOpenid(openid);
  if (existing) {
    return existing;
  }

  return repository.save({
    openid,
    growth: 0,
    createdAt: now().toISOString(),
  });
}
