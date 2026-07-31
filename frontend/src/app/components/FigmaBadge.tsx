import React, { useRef, useLayoutEffect, useState } from 'react';

const AutoFitText = ({ text, defaultSize, className, align = 'center' }: { text: string, defaultSize: number, className?: string, align?: 'left' | 'center' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const updateScale = () => {
      if (containerRef.current && textRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const textWidth = textRef.current.scrollWidth;
        setScale(textWidth > containerWidth ? (containerWidth / textWidth) * 0.98 : 1);
      }
    };

    updateScale();

    // 等待字体加载完成后重新计算
    document.fonts.ready.then(updateScale);
  }, [text, defaultSize]);

  const origin = align === 'left' ? 'left center' : 'center center';

  return (
    <div ref={containerRef} className={`w-full overflow-visible flex ${align === 'left' ? 'justify-start' : 'justify-center'} ${className || ''}`}>
      <span ref={textRef} style={{ fontSize: `${defaultSize}px`, transform: `scale(${scale})`, transformOrigin: origin, whiteSpace: 'nowrap', display: 'inline-block', willChange: 'transform' }}>{text}</span>
    </div>
  );
};

export interface FigmaBadgeData {
  organizationName: string;
  departmentName: string;
  phaseTagEn: string;
  phaseTagZh: string;
  eventSubtitle: string;
  eventTitle: string;
  participantName: string;
  participantEnglishName: string;
}

interface Props { data: FigmaBadgeData; }

export default function FigmaBadge({ data }: Props) {
  return (
    <div className="font-sans select-none" style={{ userSelect: "none" }}>
      <div className="relative w-[440px] h-[680px] bg-white rounded-[16px] overflow-hidden flex flex-col"
        style={{ boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.2)' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-indigo-50/80 z-0" />
        <div className="absolute top-[-10%] right-[-10%] w-[350px] h-[350px] bg-blue-400/20 rounded-full blur-[40px]" />
        <div className="absolute bottom-[15%] left-[-20%] w-[450px] h-[450px] bg-purple-500/15 rounded-full blur-[50px]" />
        <div className="absolute top-[40%] right-[-20%] w-[300px] h-[300px] bg-fuchsia-400/10 rounded-full blur-[40px]" />
        <div className="absolute top-[25%] left-[-28px] -rotate-90 origin-left opacity-[0.03] pointer-events-none whitespace-nowrap z-0">
          <span className="text-[110px] font-black tracking-tighter">AI ACTION</span>
        </div>
        <div className="absolute bottom-0 left-0 w-full h-[300px] opacity-[0.2] pointer-events-none z-0 flex items-end">
          <svg viewBox="0 0 440 250" className="w-full h-auto" preserveAspectRatio="xMidYMax slice">
            <defs><linearGradient id="skylineGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#2563eb" /><stop offset="50%" stopColor="#4f46e5" /><stop offset="100%" stopColor="#9333ea" /></linearGradient></defs>
            <g fill="url(#skylineGrad)">
              <g transform="translate(45, 0)"><g stroke="url(#skylineGrad)" strokeLinecap="round" strokeLinejoin="round" fill="none"><path d="M 20 250 C 25 210 34 180 35 175" strokeWidth="2" /><path d="M 35 250 C 35 220 39 190 40 175" strokeWidth="1.5" /><path d="M 80 250 C 75 210 66 180 65 175" strokeWidth="2" /><path d="M 65 250 C 65 220 61 190 60 175" strokeWidth="1.5" /><path d="M 35 250 C 35 230 40 215 50 215 C 60 215 65 230 65 250" strokeWidth="2.5" /><line x1="32" y1="180" x2="68" y2="180" strokeWidth="3.5" /><line x1="34" y1="175" x2="66" y2="175" strokeWidth="2" /><line x1="42" y1="115" x2="58" y2="115" strokeWidth="3" /><line x1="43" y1="110" x2="57" y2="110" strokeWidth="2" /><path d="M 43 110 C 46 80 48 60 48.5 50" strokeWidth="2" /><path d="M 57 110 C 54 80 52 60 51.5 50" strokeWidth="2" /></g></g>
              <g transform="translate(230, 0)"><path d="M 10 250 L 35 200 L 40 200 L 15 250 Z" opacity="0.6"/><path d="M 70 250 L 45 200 L 40 200 L 65 250 Z" opacity="0.6"/><circle cx="40" cy="180" r="22" opacity="0.8"/><circle cx="40" cy="95" r="15" opacity="0.9"/><circle cx="40" cy="65" r="5" /></g>
              <path d="M -20 250 Q 100 200 220 230 T 460 210 L 460 250 Z" fill="url(#skylineGrad)" opacity="0.3"/>
            </g>
          </svg>
        </div>
        <div className="relative z-10 w-full h-full p-8 flex flex-col">
          <div className="flex justify-between items-start">
            <div className="flex items-center space-x-3 text-[#c40026]">
              <div className="w-11 h-11 flex items-center justify-center"><svg viewBox="0 0 24 24" className="w-full h-full" fill="currentColor"><path d="M12 2L3 7l0 6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12l0-6L12 2zm0 2.2l6.8 3.5v5.3c0 4.2-2.9 8.1-6.8 9.2-3.9-1.1-6.8-5-6.8-9.2V7.7L12 4.2z"/></svg></div>
              <div className="flex flex-col w-[200px]">
                <AutoFitText text={data.organizationName} defaultSize={15} align="left" className="font-black tracking-widest leading-tight" />
                <AutoFitText text={data.departmentName} defaultSize={11} align="left" className="font-bold tracking-wider leading-tight mt-0.5" />
              </div>
            </div>
            <div className="relative border-r-2 border-blue-500 pr-3 py-1 text-right">
              <div className="text-[14px] font-black text-blue-600 uppercase tracking-widest">{data.phaseTagEn}</div>
              <div className="text-[16px] font-bold text-slate-800">{data.phaseTagZh}</div>
            </div>
          </div>
          <div className="mt-16 ml-1 relative z-20">
            <div className="flex items-center space-x-2 mb-5">
              <div className="w-6 h-[3px] bg-gradient-to-r from-blue-600 to-purple-600 rounded-full"></div>
              <span className="font-bold tracking-[0.25em] text-blue-700 uppercase text-[15px]">{data.eventSubtitle}</span>
            </div>
            <h1 className="leading-[1.15] font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-blue-800 via-indigo-700 to-purple-800 text-[50px]">
              {data.eventTitle.split('\n').map((line, i, a) => <React.Fragment key={i}>{line}{i < a.length - 1 && <br />}</React.Fragment>)}
            </h1>
          </div>
          <div className="flex-grow"></div>
          <div className="relative z-20 w-full flex flex-col items-center justify-center mb-[160px] px-2 overflow-hidden">
            <AutoFitText text={data.participantName} defaultSize={52} align="center" className="leading-none font-black tracking-widest text-slate-900 mb-2" />
            <AutoFitText text={data.participantEnglishName} defaultSize={22} align="center" className="font-bold tracking-[0.25em] text-slate-600 uppercase" />
          </div>
        </div>
      </div>
    </div>
  );
}
