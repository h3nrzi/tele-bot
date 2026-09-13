export interface WallexConfig {
  apiKey: string;
  baseUrl?: string;
}

export class WallexConfigVo {
  public readonly apiKey: string;
  public readonly baseUrl: string;

  constructor(apiKey: string, baseUrl = 'https://api.wallex.ir') {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('WALLEX_API_KEY is required');
    }
    this.apiKey = apiKey.trim();
    this.baseUrl = (baseUrl || 'https://api.wallex.ir').trim().replace(/\/+$/, '');
  }

  public static fromEnv(env: NodeJS.ProcessEnv = process.env): WallexConfigVo {
    const apiKey = env.WALLEX_API_KEY;
    if (!apiKey) {
      throw new Error('WALLEX_API_KEY environment variable is required');
    }
    const baseUrl = env.WALLEX_API_BASE_URL || 'https://api.wallex.ir';
    return new WallexConfigVo(apiKey, baseUrl);
  }
}
