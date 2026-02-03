import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getApiUrl } from "@/lib/api";
import { X, Eye } from "lucide-react";
import { useState } from "react";

interface AcademicArticle {
  id: string;
  title: string;
  description: string;
  image: string | null;
  category: string;
  readTime: string;
}

export default function Academic() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<{ articles: AcademicArticle[] }>({
    queryKey: ["/api/academic"],
    queryFn: async () => {
      const url = getApiUrl("/api/academic");
      console.log('[ACADEMIC] Fetching from:', url);
      const res = await fetch(url, {
        cache: "no-store",
      });
      console.log('[ACADEMIC] Response status:', res.status);
      if (!res.ok) {
        const text = await res.text();
        console.error('[ACADEMIC] Error response:', text);
        throw new Error(`Failed to fetch: ${res.status}`);
      }
      const json = await res.json();
      console.log('[ACADEMIC] Received data:', json);
      console.log('[ACADEMIC] Articles count:', json.articles?.length);
      return json;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: true,
  });

  console.log('[ACADEMIC RENDER] isLoading:', isLoading, 'data:', data, 'error:', error);

  if (isLoading) {
    return (
      <div className="min-h-screen -mx-4 -mt-16 pt-16 px-4 bg-gradient-to-b from-orange-900/30 via-red-900/20 to-orange-950/30">
        <div className="pt-8 pb-4 px-4 md:px-8">
          <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-orange-400 via-red-400 to-orange-400 bg-clip-text text-transparent">
            Academic
          </h2>
          <div className="h-px bg-gradient-to-r from-orange-500/50 via-red-500/50 to-orange-500/50" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-6 px-4 md:px-8">
          {[...Array(10)].map((_, i) => (
            <Card key={i} className="flex flex-col bg-orange-900/20 border-orange-700/30 backdrop-blur-md">
              <div className="h-48 w-full animate-pulse rounded-t-xl bg-orange-800/30" />
              <div className="flex-1 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-20 animate-pulse rounded bg-orange-800/30" />
                  <div className="h-4 w-24 animate-pulse rounded bg-orange-800/30" />
                </div>
                <div className="space-y-2">
                  <div className="h-5 w-full animate-pulse rounded bg-orange-800/30" />
                  <div className="h-5 w-4/5 animate-pulse rounded bg-orange-800/30" />
                </div>
                <div className="space-y-2">
                  <div className="h-4 w-full animate-pulse rounded bg-orange-800/30" />
                  <div className="h-4 w-3/4 animate-pulse rounded bg-orange-800/30" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen -mx-4 -mt-16 pt-16 px-4 bg-gradient-to-b from-orange-900/30 via-red-900/20 to-orange-950/30">
        <div className="pt-8 pb-4 px-4 md:px-8">
          <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-orange-400 via-red-400 to-orange-400 bg-clip-text text-transparent">
            Academic
          </h2>
          <div className="h-px bg-gradient-to-r from-orange-500/50 via-red-500/50 to-orange-500/50" />
        </div>
        <div className="text-center py-12 px-4">
          <p className="text-orange-300">Error loading guides: {error.message}</p>
          <p className="text-orange-400 text-sm mt-2">Check console for details</p>
        </div>
      </div>
    );
  }

  if (!data?.articles || data.articles.length === 0) {
    return (
      <div className="min-h-screen -mx-4 -mt-16 pt-16 px-4 bg-gradient-to-b from-orange-900/30 via-red-900/20 to-orange-950/30">
        <div className="pt-8 pb-4 px-4 md:px-8">
          <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-orange-400 via-red-400 to-orange-400 bg-clip-text text-transparent">
            Academic
          </h2>
          <div className="h-px bg-gradient-to-r from-orange-500/50 via-red-500/50 to-orange-500/50" />
        </div>
        <div className="text-center py-12 px-4">
          <p className="text-orange-300">No guides available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen -mx-4 -mt-16 pt-16 px-4 bg-gradient-to-b from-orange-900/30 via-red-900/20 to-orange-950/30">
      {/* Image Lightbox */}
      {selectedImage && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/90 z-[9999] backdrop-blur-sm"
            onClick={() => setSelectedImage(null)}
          />
          
          {/* Image Preview */}
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 pointer-events-none">
            <div className="relative max-w-7xl max-h-[90vh] pointer-events-auto">
              {/* Close Button */}
              <button
                onClick={() => setSelectedImage(null)}
                className="absolute -top-12 right-0 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                <X className="w-6 h-6 text-white" />
              </button>
              
              {/* Image */}
              <img
                src={selectedImage}
                alt="Preview"
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        </>
      )}

      <div className="pt-8 pb-4 px-4 md:px-8">
        <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-orange-400 via-red-400 to-orange-400 bg-clip-text text-transparent">
          Academic
        </h2>
        <div className="h-px bg-gradient-to-r from-orange-500/50 via-red-500/50 to-orange-500/50" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-6 px-4 md:px-8">
        {data.articles.map((article) => (
          <Card
            key={article.id}
            className="relative group cursor-pointer bg-orange-900/20 backdrop-blur-md border-2 border-orange-700/30 transition-all duration-300 rounded-xl hover:-translate-y-1 hover:bg-orange-900/30 hover:border-orange-500/50 hover:shadow-xl hover:shadow-orange-500/20 flex flex-col overflow-hidden"
            onClick={() => (window.location.href = `/article/${article.id}`)}
          >
            {article.image && (
              <div 
                className="relative w-full h-48 overflow-hidden cursor-pointer group"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedImage(article.image);
                }}
              >
                <img
                  src={article.image}
                  alt={article.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-orange-900/90 via-orange-900/40 to-transparent pointer-events-none" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center">
                  <Eye className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>
              </div>
            )}
            <div className="flex flex-col flex-1 p-4">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge
                  variant="secondary"
                  className="bg-orange-500/30 text-orange-100 font-medium text-xs backdrop-blur-sm border border-orange-400/40"
                >
                  {article.category}
                </Badge>
                <span className="text-xs text-orange-200/80">{article.readTime}</span>
              </div>
              <h3 className="text-base font-bold text-white mb-2 line-clamp-2 drop-shadow-sm">
                {article.title}
              </h3>
              <p className="text-sm text-orange-50/90 line-clamp-3 flex-1 drop-shadow-sm">
                {article.description}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
