import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Download, User, Loader2, Check, Plus, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { cn } from '@/lib/utils';
import styles from './ModDetailsView.module.css';

interface ModDetailsViewProps {
    item: any;
    onBack: () => void;
    onInstall: (item: any) => void;
    isInstalling: boolean;
    isInstalled: boolean;
    hasUpdate?: boolean;
    type: 'mods' | 'modpacks';
}

const ModDetailsView: React.FC<ModDetailsViewProps> = ({ 
    item, 
    onBack,
    onInstall, 
    isInstalling, 
    isInstalled,
    hasUpdate = false,
    type
}) => {
    const [details, setDetails] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [description, setDescription] = useState<string>("");
    const [gallery, setGallery] = useState<string[]>([]);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    useEffect(() => {
        if (item) {
            loadDetails();
        }
    }, [item]);

    const loadDetails = async () => {
        setLoading(true);
        try {
            if (item.source === 'modrinth') {
                // Fetch Project
                const url = `https://api.modrinth.com/v2/project/${item.id}`;
                const responseText = await invoke('fetch_cors', { url }) as string;
                const data = JSON.parse(responseText);
                setDetails(data);
                setDescription(data.body || item.description);
                setGallery(data.gallery?.map((g: any) => g.url) || []);
            } else {
                // CurseForge
                // Fetch Description
                const url = `https://api.curseforge.com/v1/mods/${item.id}/description`;
                const responseText = await invoke('fetch_cors', { 
                    url,
                    headers: {
                        'x-api-key': '$2a$10$/Dc9lilNTw0EvobjzoQLWu7zJpqX38hahG/jugi41F39z08R1rMZC',
                        'Accept': 'application/json'
                    }
                }) as string;
                
                try {
                    const data = JSON.parse(responseText);
                    setDescription(data.data || "No description available.");
                } catch (e) {
                    console.error("Failed to parse CurseForge description", e);
                    setDescription(responseText);
                }
                
                // Gallery is in original item usually
                if (item.original?.screenshots) {
                    setGallery(item.original.screenshots.map((s: any) => s.url));
                }
            }
        } catch (e) {
            console.error("Failed to load details", e);
            setDescription(item.description || "No description available.");
        } finally {
            setLoading(false);
        }
    };

    if (!item) return null;

    return (
        <div className={styles.container}>
            {/* Header Bar */}
            <div className={styles.topBar}>
                <button onClick={onBack} className={styles.backButton}>
                    <ArrowLeft size={20} />
                    <span>Volver</span>
                </button>
            </div>

            <div className={styles.scrollContent}>
                {/* Hero Section */}
                <div className={styles.hero}>
                    <img src={item.icon} alt={item.name} className={styles.icon} />
                    <div className={styles.heroInfo}>
                        <h1 className={styles.title}>{item.name}</h1>
                        <div className={styles.meta}>
                            <span className={styles.metaItem}>
                                <User size={16} />
                                {item.author}
                            </span>
                            <span className={styles.metaItem}>
                                <Download size={16} />
                                {item.downloads}
                            </span>
                            {item.source === 'modrinth' && (
                                <span className={styles.categoryTag}>Modrinth</span>
                            )}
                            {item.source === 'curseforge' && (
                                <span className={styles.categoryTag}>CurseForge</span>
                            )}
                        </div>
                        {details?.categories && (
                            <div className={styles.categories}>
                                {details.categories.map((cat: string) => (
                                    <span key={cat} className={styles.categoryTag}>{cat}</span>
                                ))}
                            </div>
                        )}
                        
                        <div className={styles.actions}>
                            <button 
                                onClick={() => onInstall(item)}
                                disabled={isInstalling || (isInstalled && !hasUpdate && type === 'mods')}
                                className={cn(
                                    styles.installButton,
                                    isInstalled && !hasUpdate && type === 'mods' && "opacity-50 cursor-not-allowed bg-green-500/20 text-green-400",
                                    isInstalled && hasUpdate && type === 'mods' && "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border-blue-500/30"
                                )}
                            >
                                {isInstalling ? (
                                    <>
                                        <Loader2 size={20} className="animate-spin" />
                                        Instalando...
                                    </>
                                ) : type === 'modpacks' ? (
                                    <>
                                        <Plus size={20} />
                                        Crear Instancia
                                    </>
                                ) : isInstalled ? (
                                    hasUpdate ? (
                                        <>
                                            <Download size={20} />
                                            Actualizar
                                        </>
                                    ) : (
                                        <>
                                            <Check size={20} />
                                            Instalado
                                        </>
                                    )
                                ) : (
                                    <>
                                        <Download size={20} />
                                        Instalar
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className={styles.content}>
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <Loader2 className="animate-spin text-[#ffbfba]" size={48} />
                        </div>
                    ) : (
                        <>
                            {/* Gallery */}
                            {gallery.length > 0 && (
                                <div className={styles.gallery}>
                                    {gallery.map((img, i) => (
                                        <img 
                                            key={i} 
                                            src={img} 
                                            alt="Screenshot" 
                                            className={styles.screenshot}
                                            onClick={() => setSelectedImage(img)}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Description */}
                            <div className="mt-8 prose prose-invert max-w-none prose-img:rounded-lg prose-a:text-[#ffbfba] prose-headings:text-white prose-strong:text-white">
                                {item.source === 'curseforge' ? (
                                    <div dangerouslySetInnerHTML={{ __html: description }} />
                                ) : (
                                    <ReactMarkdown 
                                        remarkPlugins={[remarkGfm]} 
                                        rehypePlugins={[rehypeRaw]}
                                        components={{
                                            img: ({node, ...props}) => <img {...props} className="max-w-full h-auto rounded-lg" />,
                                            a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-[#ffbfba] hover:underline" />
                                        }}
                                    >
                                        {description}
                                    </ReactMarkdown>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Lightbox */}
            <AnimatePresence>
                {selectedImage && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
                        onClick={() => setSelectedImage(null)}
                    >
                        <button 
                            className="absolute top-4 right-4 text-white/70 hover:text-white"
                            onClick={() => setSelectedImage(null)}
                        >
                            <X size={32} />
                        </button>
                        <motion.img
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.9 }}
                            src={selectedImage}
                            alt="Enlarged screenshot"
                            className="w-full h-full max-w-[70vw] max-h-[70vh] object-contain rounded-lg shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ModDetailsView;
