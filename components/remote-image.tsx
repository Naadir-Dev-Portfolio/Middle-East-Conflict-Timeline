import { useState, type ImgHTMLAttributes } from 'react';
import { ImageOff } from 'lucide-react';

/** Direct publisher URLs; unavailable hotlinks do not break the surrounding event. */
export function RemoteImage({ src, alt = '', style, ...props }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = failedUrl === src;
  return <>
    <img {...props} src={src} alt={alt} decoding="async" onError={() => setFailedUrl(src)}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', ...style, ...(failed ? { display: 'none' } : {}) }} />
    {failed ? <span className="media-unavailable" title={alt}>
      <ImageOff aria-hidden="true" /><span>Image unavailable from publisher</span><span className="sr-only">{alt}</span>
    </span> : null}
  </>;
}
