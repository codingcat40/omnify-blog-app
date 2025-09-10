import Post from "../Post";
import { useEffect, useState } from "react";

export default function IndexPage() {
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetch(`https://omnify-blog-app-n6gd.onrender.com/post?page=${page}&limit=5`)
      .then(response => response.json())
      .then(data => {
        setPosts(data.posts);
        setTotalPages(data.totalPages);
      });
  }, [page]);

  return (
    <div>
      {posts.length > 0 && posts.map(post => (
        <Post key={post._id} {...post} />
      ))}

      {/* Pagination Controls */}
      <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
        <button 
          onClick={() => setPage(prev => Math.max(prev - 1, 1))}
          disabled={page === 1}
        >
          Prev
        </button>
        <span> Page {page} of {totalPages} </span>
        <button 
          onClick={() => setPage(prev => Math.min(prev + 1, totalPages))}
          disabled={page === totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
}
