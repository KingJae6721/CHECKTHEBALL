import './globals.css';
export const metadata = { title: 'CheckTheBall — First Person Basketball', description: 'CheckTheBall: 김영재의 1인칭 농구 프로토타입. 조준하고, 점프하고, 릴리스하세요.' };
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="ko"><body>{children}</body></html>; }
