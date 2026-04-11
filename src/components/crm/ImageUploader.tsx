// ImageUploader — Upload a profile photo or org logo to Supabase Storage.
// Renders a clickable avatar circle/square that opens a file picker.

import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Camera, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  bucket:    'org-logos' | 'contact-avatars';
  entityId:  string;                          // used as file path key
  currentUrl?: string | null;
  initials:  string;                          // shown when no image
  size?:     'sm' | 'md' | 'lg';
  shape?:    'circle' | 'square';
  onUpload:  (url: string) => void;
  onRemove?: () => void;
  editable?: boolean;
}

const SIZES = {
  sm: { container: 'h-10 w-10', text: 'text-sm',  icon: 'h-3.5 w-3.5' },
  md: { container: 'h-16 w-16', text: 'text-lg',  icon: 'h-4 w-4'   },
  lg: { container: 'h-20 w-20', text: 'text-2xl', icon: 'h-5 w-5'   },
};

const ImageUploader = ({
  bucket, entityId, currentUrl, initials, size = 'md',
  shape = 'circle', onUpload, onRemove, editable = true,
}: Props) => {
  const fileRef  = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview,   setPreview]   = useState<string | null>(currentUrl ?? null);
  const [hover,     setHover]     = useState(false);
  const dim = SIZES[size];

  const handleFile = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5 MB'); return; }

    // Local preview immediately
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${entityId}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: true, contentType: file.type });

      if (upErr) throw upErr;

      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      // Add cache-bust so updated image shows immediately
      const url = `${data.publicUrl}?t=${Date.now()}`;

      onUpload(url);
      toast.success('Image uploaded');
    } catch (e: any) {
      toast.error('Upload failed: ' + (e.message ?? 'Unknown error'));
      setPreview(currentUrl ?? null);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreview(null);
    onRemove?.();
  };

  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-xl';

  return (
    <div className="relative inline-block">
      <div
        className={cn(
          'relative flex shrink-0 items-center justify-center overflow-hidden',
          radius, dim.container,
          editable ? 'cursor-pointer' : 'cursor-default',
          !preview && 'bg-primary/10'
        )}
        onClick={() => editable && fileRef.current?.click()}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {/* Image or initials */}
        {preview ? (
          <img src={preview} alt="Profile" className="h-full w-full object-cover" />
        ) : (
          <span className={cn('font-bold text-primary select-none', dim.text)}>
            {initials.slice(0, 2).toUpperCase()}
          </span>
        )}

        {/* Upload overlay on hover */}
        {editable && (hover || uploading) && (
          <div className={cn(
            'absolute inset-0 flex flex-col items-center justify-center gap-0.5',
            'bg-black/40 backdrop-blur-[1px] transition-opacity',
            radius
          )}>
            {uploading
              ? <Loader2 className={cn('animate-spin text-white', dim.icon)} />
              : <Camera className={cn('text-white', dim.icon)} />
            }
            {size !== 'sm' && (
              <span className="text-[9px] text-white font-medium">
                {uploading ? 'Uploading…' : 'Change'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Remove button */}
      {editable && preview && onRemove && !uploading && (
        <button
          onClick={handleRemove}
          className={cn(
            'absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center',
            'rounded-full bg-destructive text-white shadow-sm hover:bg-red-700 transition-colors'
          )}
        >
          <X className="h-3 w-3" />
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
    </div>
  );
};

export default ImageUploader;
