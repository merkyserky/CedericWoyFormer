export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Helper for CORS JSON responses
    const jsonResponse = (data, status = 200) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    };

    try {
      // 1. GET /api/levels -> List all community levels
      if (request.method === "GET" && path === "/api/levels") {
        const indexStr = await env.LEVELS_KV.get("levels_index");
        const index = indexStr ? JSON.parse(indexStr) : [];
        return jsonResponse(index);
      }

      // 2. GET /api/levels/:id -> Get specific level data
      if (request.method === "GET" && path.startsWith("/api/levels/")) {
        const id = path.substring("/api/levels/".length);
        if (!id) {
          return jsonResponse({ error: "Missing level ID" }, 400);
        }
        const levelDataStr = await env.LEVELS_KV.get(`level_data:${id}`);
        if (!levelDataStr) {
          return jsonResponse({ error: "Level not found" }, 404);
        }
        return jsonResponse(JSON.parse(levelDataStr));
      }

      // 3. POST /api/levels -> Upload new level
      if (request.method === "POST" && path === "/api/levels") {
        const body = await request.json();
        
        // Basic validation
        if (!body.name || !body.map || !body.width || !body.height) {
          return jsonResponse({ error: "Invalid level structure. Missing name, map, width, or height." }, 400);
        }

        const id = crypto.randomUUID();
        const author = body.author || "Anonymous";
        const timestamp = Date.now();

        // 1. Save level data
        await env.LEVELS_KV.put(`level_data:${id}`, JSON.stringify(body));

        // 2. Update index
        const indexStr = await env.LEVELS_KV.get("levels_index");
        const index = indexStr ? JSON.parse(indexStr) : [];
        
        index.push({
          id,
          name: body.name,
          author,
          theme: body.theme || 1,
          timestamp
        });

        // Keep index trimmed to latest 100 levels to avoid exceeding KV size limits in this simple sample
        if (index.length > 100) {
          const removed = index.shift();
          await env.LEVELS_KV.delete(`level_data:${removed.id}`);
        }

        await env.LEVELS_KV.put("levels_index", JSON.stringify(index));

        return jsonResponse({ success: true, id, name: body.name, author });
      }

      return jsonResponse({ error: "Not found" }, 404);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }
};
