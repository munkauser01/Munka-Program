window.paint = async (data) => {
  const bg = document.querySelector("#background");
  bg.src = `data:${data.mime};base64,${data.background}`;
  await bg.decode();
  if (data.position === "left") {
    document.querySelector("section").style.left = "5vw";
    document.querySelector("section").style.right = "auto";
  }
  for (const t of data.tasks) {
    const article = document.createElement("article");
    article.textContent = t.title;
    const small = document.createElement("small");
    small.textContent = t.date || "Anytime";
    article.append(small);
    document.querySelector("#tasks").append(article);
  }
  return true;
};
