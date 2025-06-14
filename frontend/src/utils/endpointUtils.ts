export async function post() {
  try {
    const response = await fetch("https://api.example.com/data", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "John Doe",
        email: "john@example.com",
      }),
    });

    const data = await response.json();
    console.log("Success:", data);
  } catch (error) {
    console.error("Error:", error);
  }
}
