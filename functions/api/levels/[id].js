// GET /api/levels/:id (Get specific custom level data)
export async function onRequestGet(context) {
  const { params, env } = context;
  const id = params.id;
  
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing level ID" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  try {
    const levelDataStr = await env.LEVELS_KV.get(`level_data:${id}`);
    if (!levelDataStr) {
      return new Response(JSON.stringify({ error: "Level not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(levelDataStr, {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
