// GET /api/levels (List community index) and POST /api/levels (Upload level)
export async function onRequestGet(context) {
  const { env } = context;
  try {
    const indexStr = await env.LEVELS_KV.get("levels_index");
    const index = indexStr ? JSON.parse(indexStr) : [];
    return new Response(JSON.stringify(index), {
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "no-cache"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.name || !body.map || !body.width || !body.height) {
      return new Response(JSON.stringify({ error: "Invalid level structure" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
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

    // Keep index trimmed to latest 100 levels
    if (index.length > 100) {
      const removed = index.shift();
      await env.LEVELS_KV.delete(`level_data:${removed.id}`);
    }

    await env.LEVELS_KV.put("levels_index", JSON.stringify(index));

    return new Response(JSON.stringify({ success: true, id, name: body.name, author }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
