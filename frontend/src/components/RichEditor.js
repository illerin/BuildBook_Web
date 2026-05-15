import React, { useEffect, useRef, useState } from 'react';

const buttons = [
  { cmd: 'bold', label: 'B', title: 'Bold', style: { fontWeight: 700 } },
  { cmd: 'italic', label: 'I', title: 'Italic', style: { fontStyle: 'italic' } },
  { cmd: 'underline', label: 'U', title: 'Underline', style: { textDecoration: 'underline' } },
  { cmd: 'insertUnorderedList', label: 'List', title: 'Bullet list' },
  { cmd: 'insertOrderedList', label: '1.', title: 'Numbered list' },
  { cmd: 'removeFormat', label: 'Clear', title: 'Clear formatting' },
];

export default function RichEditor({
  value,
  onChange,
  onSave,
  saving,
  placeholder = 'Write notes...',
  onUploadImage,
}) {
  const ref = useRef(null);
  const fileRef = useRef(null);
  const [showLink, setShowLink] = useState(false);
  const [link, setLink] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [imageScale, setImageScale] = useState(60);
  const [markupImage, setMarkupImage] = useState(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || '')) ref.current.innerHTML = value || '';
  }, [value]);

  const emit = () => onChange(ref.current?.innerHTML || '');

  const exec = (cmd, arg = null) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
  };

  const addLink = () => {
    if (!link.trim()) return;
    const url = link.startsWith('http') ? link : `https://${link}`;
    exec('createLink', url);
    setLink('');
    setShowLink(false);
  };

  const insertUploadedImage = async (file) => {
    if (!file || !onUploadImage) return;
    const url = await onUploadImage(file);
    ref.current?.focus();
    document.execCommand(
      'insertHTML',
      false,
      `<img src="${url}" alt="" style="width:60%;max-width:100%;height:auto;display:block;margin:10px 0;border-radius:6px;" />`,
    );
    emit();
  };

  const pickImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    await insertUploadedImage(file);
  };

  const selectImage = (img) => {
    setSelectedImage(img);
    const width = img.style.width || '60%';
    const percent = width.endsWith('%') ? parseInt(width, 10) : Math.round((img.clientWidth / ref.current.clientWidth) * 100);
    setImageScale(Number.isFinite(percent) ? Math.max(20, Math.min(100, percent)) : 60);
  };

  const setSelectedImageScale = (scale) => {
    if (!selectedImage) return;
    selectedImage.style.width = `${scale}%`;
    selectedImage.style.maxWidth = '100%';
    selectedImage.style.height = 'auto';
    selectedImage.style.display = 'block';
    selectedImage.style.margin = '10px 0';
    selectedImage.style.borderRadius = '6px';
    setImageScale(scale);
    emit();
  };

  const replaceSelectedImage = (url) => {
    if (!selectedImage) return;
    selectedImage.src = url;
    emit();
  };

  return (
    <div className="rich-editor">
      <div className="rich-toolbar">
        <select onChange={(e) => exec('formatBlock', e.target.value)} defaultValue="div">
          <option value="div">Normal</option>
          <option value="h2">Heading</option>
          <option value="h3">Subhead</option>
          <option value="pre">Code</option>
          <option value="blockquote">Quote</option>
        </select>
        {buttons.map((button) => (
          <button
            key={button.cmd}
            title={button.title}
            type="button"
            style={button.style}
            onMouseDown={(e) => {
              e.preventDefault();
              exec(button.cmd);
            }}
          >
            {button.label}
          </button>
        ))}
        <button type="button" disabled={!onUploadImage} onMouseDown={(e) => { e.preventDefault(); fileRef.current?.click(); }}>
          Image
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickImage} />
        <div className="link-wrap">
          <button type="button" onMouseDown={(e) => { e.preventDefault(); setShowLink((v) => !v); }}>
            Link
          </button>
          {showLink && (
            <div className="link-popover">
              <input
                autoFocus
                value={link}
                placeholder="https://..."
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addLink();
                  if (e.key === 'Escape') setShowLink(false);
                }}
              />
              <button className="btn btn-primary btn-sm" type="button" onMouseDown={(e) => { e.preventDefault(); addLink(); }}>
                Add
              </button>
            </div>
          )}
        </div>

        {selectedImage && (
          <div className="image-tools">
            <span>Image</span>
            {[25, 50, 75, 100].map((scale) => (
              <button key={scale} type="button" className={imageScale === scale ? 'active' : ''} onMouseDown={(e) => { e.preventDefault(); setSelectedImageScale(scale); }}>
                {scale}%
              </button>
            ))}
            <input
              type="range"
              min="20"
              max="100"
              value={imageScale}
              onChange={(e) => setSelectedImageScale(Number(e.target.value))}
            />
            <button type="button" onMouseDown={(e) => { e.preventDefault(); setMarkupImage(selectedImage); }}>
              Markup
            </button>
          </div>
        )}

        {onSave && (
          <button className="save-editor" type="button" disabled={saving} onMouseDown={(e) => { e.preventDefault(); onSave(); }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>
      <div
        ref={ref}
        className="rich-area"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emit}
        onClick={(e) => {
          if (e.target?.tagName === 'IMG') selectImage(e.target);
          else setSelectedImage(null);
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && onSave) {
            e.preventDefault();
            onSave();
          }
        }}
      />
      {markupImage && (
        <MarkupModal
          image={markupImage}
          onClose={() => setMarkupImage(null)}
          onSave={async (file) => {
            const url = await onUploadImage(file);
            replaceSelectedImage(url);
            setMarkupImage(null);
          }}
        />
      )}
    </div>
  );
}

function MarkupModal({ image, onClose, onSave }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [lineColor, setLineColor] = useState('#ff3b30');
  const [lineWidth, setLineWidth] = useState(4);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const source = new Image();
    source.crossOrigin = 'anonymous';
    source.onload = () => {
      const maxWidth = 900;
      const scale = Math.min(1, maxWidth / source.naturalWidth);
      canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    };
    source.src = image.src;
  }, [image.src]);

  const point = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const start = (event) => {
    const ctx = canvasRef.current.getContext('2d');
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    setDrawing(true);
  };

  const draw = (event) => {
    if (!drawing) return;
    const ctx = canvasRef.current.getContext('2d');
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const save = async () => {
    const canvas = canvasRef.current;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    await onSave(new File([blob], `marked-up-${Date.now()}.png`, { type: 'image/png' }));
  };

  return (
    <div className="markup-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="markup-modal">
        <div className="markup-toolbar">
          <strong>Markup Image</strong>
          <label>
            Color
            <input type="color" value={lineColor} onChange={(e) => setLineColor(e.target.value)} />
          </label>
          <label>
            Size
            <input type="range" min="2" max="14" value={lineWidth} onChange={(e) => setLineWidth(Number(e.target.value))} />
          </label>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={save}>Save Markup</button>
        </div>
        <canvas
          ref={canvasRef}
          onMouseDown={start}
          onMouseMove={draw}
          onMouseUp={() => setDrawing(false)}
          onMouseLeave={() => setDrawing(false)}
        />
      </div>
    </div>
  );
}
