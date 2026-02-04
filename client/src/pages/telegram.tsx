import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { Eye, X, ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut } from "lucide-react";
import { ClaimButton } from "@/components/claim-button";

interface TelegramPost {
  messageId: number;
  channel: string;
  text: string;
  date: string;
  image: string | null;
  views: number;
}

export default function Telegram() {
  const [selectedPost, setSelectedPost] = useState<TelegramPost | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);

  const { data: posts, isLoading } = useQuery<TelegramPost[]>({
    queryKey: ["/api/telegram/airdrop"],
    queryFn: async () => {
      const res = await fetch("/api/telegram/airdrop");
      if (!res.ok) throw new Error("Failed to fetch airdrop opportunities");
      const data = await res.json();
      
      // Handle new response format { posts: [], fetchedAt: "", totalPosts: 0 }
      const postsArray = Array.isArray(data) ? data : (data.posts || []);
      
      // FILTER: Only posts with images
      const postsWithImages = postsArray.filter((post: TelegramPost) => post.image);
      
      // Sort by date (newest first)
      postsWithImages.sort((a: TelegramPost, b: TelegramPost) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA;
      });
      
      // Limit to 40 most recent posts WITH IMAGES
      return postsWithImages.slice(0, 40);
    },
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
    staleTime: 2 * 60 * 1000, // Consider data stale after 2 minutes
  });

  // Get posts with images for navigation
  const postsWithImages = (posts || []).filter(post => post.image);

  // Handle keyboard navigation for image preview
  useEffect(() => {
    if (!selectedPost) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPost(null);
        setZoom(1);
      } else if (e.key === 'ArrowLeft') {
        if (currentIndex > 0) {
          const prevPost = postsWithImages[currentIndex - 1];
          setSelectedPost(prevPost);
          setCurrentIndex(currentIndex - 1);
          setZoom(1);
        }
      } else if (e.key === 'ArrowRight') {
        if (currentIndex < postsWithImages.length - 1) {
          const nextPost = postsWithImages[currentIndex + 1];
          setSelectedPost(nextPost);
          setCurrentIndex(currentIndex + 1);
          setZoom(1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPost, currentIndex, postsWithImages]);

  const openImagePreview = (post: TelegramPost) => {
    setSelectedPost(post);
    const index = postsWithImages.findIndex(p => p.messageId === post.messageId && p.channel === post.channel);
    setCurrentIndex(index);
    setZoom(1);
  };

  const navigateNext = () => {
    if (currentIndex < postsWithImages.length - 1) {
      const nextPost = postsWithImages[currentIndex + 1];
      setSelectedPost(nextPost);
      setCurrentIndex(currentIndex + 1);
      setZoom(1);
    }
  };

  const navigatePrevious = () => {
    if (currentIndex > 0) {
      const prevPost = postsWithImages[currentIndex - 1];
      setSelectedPost(prevPost);
      setCurrentIndex(currentIndex - 1);
      setZoom(1);
    }
  };

  const handleDownload = () => {
    if (selectedPost?.image) {
      const link = document.createElement('a');
      link.href = selectedPost.image;
      link.download = `trading-${selectedPost.channel}-${selectedPost.messageId}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen trading-bg -mt-16 pt-16">
        <div className="relative z-10">
          <div className="pt-6 pb-4" style={{ paddingLeft: '15px', paddingRight: '15px' }}>
            <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent border-b-2 border-emerald-500/30 pb-4">
              Airdrop Opportunities
            </h1>
          </div>
          <div className="grid grid-cols-5 gap-6" style={{ paddingLeft: '8px', paddingRight: '8px' }}>
            {[...Array(10)].map((_, i) => (
              <Card key={i} className="backdrop-blur-md bg-emerald-900/10 border-2 border-emerald-500/50 rounded-xl p-4">
                <div className="h-48 bg-emerald-800/20 animate-pulse rounded mb-4" />
                <div className="h-4 bg-emerald-800/20 animate-pulse rounded mb-2" />
                <div className="h-4 bg-emerald-800/20 animate-pulse rounded w-2/3" />
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen trading-bg -mt-16 pt-16">
      {/* Image Preview Popup */}
      {selectedPost && selectedPost.image && (
        <>
          {/* Backdrop - Very light transparent */}
          <div
            className="fixed inset-0 bg-black/20 z-[9999] backdrop-blur-[2px] animate-in fade-in duration-200"
            onClick={() => {
              setSelectedPost(null);
              setZoom(1);
            }}
          />
          
          {/* Preview Card - Very subtle gray */}
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-8 pointer-events-none">
            <div 
              className="relative bg-gray-800/60 backdrop-blur-md rounded-xl shadow-2xl border border-emerald-500/40 overflow-hidden pointer-events-auto animate-in zoom-in-95 duration-200"
              style={{ maxWidth: '900px', maxHeight: '85vh' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-emerald-500/30 bg-gray-700/25">
                <div className="flex items-center gap-3">
                  <Badge className="bg-emerald-600 text-white">
                    {selectedPost.channel}
                  </Badge>
                  <span className="text-sm text-gray-300">
                    {currentIndex + 1} / {postsWithImages.length}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Navigation */}
                  <button
                    onClick={navigatePrevious}
                    disabled={currentIndex === 0}
                    className="p-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Previous (←)"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-200" />
                  </button>
                  <button
                    onClick={navigateNext}
                    disabled={currentIndex >= postsWithImages.length - 1}
                    className="p-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Next (→)"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-200" />
                  </button>
                  
                  {/* Zoom */}
                  <div className="h-6 w-px bg-gray-500 mx-1" />
                  <button
                    onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
                    className="p-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 transition-colors"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-4 h-4 text-gray-200" />
                  </button>
                  <span className="text-gray-200 text-xs min-w-[45px] text-center">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    onClick={() => setZoom(Math.min(3, zoom + 0.25))}
                    className="p-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 transition-colors"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-4 h-4 text-gray-200" />
                  </button>
                  
                  {/* Download */}
                  <div className="h-6 w-px bg-gray-500 mx-1" />
                  <button
                    onClick={handleDownload}
                    className="p-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 transition-colors"
                    title="Download"
                  >
                    <Download className="w-4 h-4 text-gray-200" />
                  </button>
                  
                  {/* Close */}
                  <button
                    onClick={() => {
                      setSelectedPost(null);
                      setZoom(1);
                    }}
                    className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors ml-2"
                    title="Close (Esc)"
                  >
                    <X className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>

              {/* Image Container */}
              <div className="relative bg-gray-700/20 flex items-center justify-center" style={{ height: '500px' }}>
                <div className="overflow-auto max-h-full max-w-full flex items-center justify-center p-4">
                  <img
                    src={selectedPost.image}
                    alt={selectedPost.text}
                    className="object-contain transition-transform duration-200 select-none rounded"
                    style={{ 
                      transform: `scale(${zoom})`,
                      maxHeight: '480px',
                      maxWidth: '100%'
                    }}
                    draggable={false}
                  />
                </div>
              </div>

              {/* Footer Info */}
              <div className="p-4 border-t border-emerald-500/30 bg-gray-700/25">
                <p className="text-gray-200 text-sm leading-relaxed line-clamp-2 mb-2">
                  {selectedPost.text}
                </p>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    {selectedPost.views?.toLocaleString() || 0} views
                  </span>
                  <span>
                    {formatDistanceToNow(new Date(selectedPost.date), { addSuffix: true })}
                  </span>
                  <span className="ml-auto text-gray-500">
                    Press ESC to close • Arrow keys to navigate
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="relative z-10">
        {/* Header Section with Border */}
        <div className="pt-6 pb-4 px-4 md:px-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b-2 border-emerald-500/30 mb-6">
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
            Airdrop Opportunities
          </h1>
          
          <ClaimButton section="airdrop" />
        </div>

        <div className="grid grid-cols-5 gap-6 pb-6 px-2 md:px-4">
          {posts?.map((post) => (
            <Card
              key={`${post.channel}-${post.messageId}`}
              className="flex flex-col h-[380px] overflow-hidden transition-all duration-300 backdrop-blur-md bg-emerald-900/10 border-2 border-emerald-500/40 hover:border-emerald-400/70 rounded-xl hover:-translate-y-2 shadow-[0_8px_16px_rgba(0,0,0,0.4),0_4px_8px_rgba(16,185,129,0.2)] hover:shadow-[0_16px_32px_rgba(0,0,0,0.6),0_8px_16px_rgba(16,185,129,0.4)]"
            >
              {post.image && (
                <div 
                  className="w-full h-48 flex-shrink-0 overflow-hidden cursor-pointer group relative"
                  onClick={() => openImagePreview(post)}
                >
                  <img
                    src={post.image}
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110 pointer-events-none"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-300 flex items-center justify-center pointer-events-none">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center gap-2">
                      <Eye className="w-8 h-8 text-white drop-shadow-lg" />
                      <span className="text-white text-sm font-medium drop-shadow-lg">Quick View</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex-1 p-4 flex flex-col overflow-hidden group">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-200 border-emerald-400/30 text-xs">
                    {post.channel}
                  </Badge>
                  <span className="text-xs text-emerald-300">
                    {formatDistanceToNow(new Date(post.date), { addSuffix: true })}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto mb-2 scrollbar-thin scrollbar-thumb-emerald-500/50 scrollbar-track-emerald-900/20">
                  <p className="text-sm text-emerald-100 group-hover:line-clamp-none line-clamp-3 transition-all">
                    {post.text}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs text-emerald-400 mt-auto">
                  <Eye className="h-3 w-3" />
                  <span>{post.views?.toLocaleString() || 0} views</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
