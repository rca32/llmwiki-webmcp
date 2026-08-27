import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from 'next/font/google';
import './globals.css';

const sans = IBM_Plex_Sans({ variable: '--font-sans', subsets: ['latin'], weight: ['400', '500', '600'] });
const mono = IBM_Plex_Mono({ variable: '--font-mono', subsets: ['latin'], weight: ['400', '500', '600'] });
const serif = Newsreader({ variable: '--font-serif', subsets: ['latin'], weight: ['500', '600'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://liminal-wiki-webmcp.chatgpt.site'),
  title: 'Liminal Wiki — WebMCP Native Knowledge',
  description: '사람과 에이전트가 같은 데이터, 권한, 리비전을 공유하는 WebMCP 네이티브 지식 작업공간',
  openGraph: {
    title: 'Liminal Wiki',
    description: '사람과 에이전트가 함께 편집하는 지식 공간',
    images: [{ url: '/og.png', width: 1748, height: 910, alt: 'Liminal Wiki 지식 연결 카드' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Liminal Wiki',
    description: '사람과 에이전트가 함께 편집하는 지식 공간',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body className={`${sans.variable} ${mono.variable} ${serif.variable}`}>{children}</body></html>;
}
