import { AiFillHeart, AiFillLinkedin, AiOutlineTwitter } from "react-icons/ai";
import { BsFacebook } from "react-icons/bs";

export function DetailsContent() {
  // rounded-md border border-solid border-white bg-slate-50 py-8 px-12 shadow-md
  return (
    <section className="@container flex w-full max-w-screen-lg flex-col gap-4">
      <h1 className="font-heading text-4xl font-bold text-slate-600">
        PyTorch Adapt
      </h1>
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-full bg-slate-500" />
        <div className="flex-1">By Kevin Musgrave</div>
        <button className="flex cursor-pointer items-center gap-2 rounded-md border border-solid border-slate-200 py-1 px-3 text-slate-500 transition-all hover:border-white hover:bg-slate-400 hover:text-white hover:shadow-md">
          <AiFillHeart /> Like
        </button>
        <button className="cursor-pointer rounded-md border border-solid border-white bg-slate-400 py-1 px-3 font-bold text-white transition-all hover:border-white hover:bg-white hover:text-slate-500 hover:shadow-md">
          Clone Project
        </button>
      </div>
      <div className="mb-8 h-96 overflow-hidden rounded-lg bg-slate-400 py-6 px-8 shadow-md"></div>
      <div className="@lg:flex-col flex gap-8">
        <article className="prose dark:prose-invert">
          <p>The Best Ever</p>
          <p>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur
            semper et neque ac aliquam. In in ornare sapien. Sed quam dui,
            commodo non egestas eget, rhoncus ut metus. Donec vitae hendrerit
            ipsum. Sed et sem ac turpis tempor facilisis. Nam neque nunc, varius
            ac mattis vel, facilisis at magna. Sed id blandit ligula, fringilla
            suscipit dui.
          </p>
          <p>
            Nullam sit amet mi rutrum, consequat purus et, euismod elit. Nullam
            eu ex urna. Cras laoreet, diam sit amet consequat suscipit, justo
            ipsum viverra nisi, sit amet vulputate ligula nibh ut ex. Morbi quis
            porttitor velit, eu tincidunt mi. Integer in ante vel enim ornare
            eleifend. Nulla molestie leo odio, quis bibendum quam maximus et.
            Sed libero elit, faucibus eu ipsum in, pharetra condimentum quam.
          </p>

          <p>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur
            semper et neque ac aliquam. In in ornare sapien. Sed quam dui,
            commodo non egestas eget, rhoncus ut metus. Donec vitae hendrerit
            ipsum. Sed et sem ac turpis tempor facilisis. Nam neque nunc, varius
            ac mattis vel, facilisis at magna. Sed id blandit ligula, fringilla
            suscipit dui.
          </p>
          <p>
            Nullam sit amet mi rutrum, consequat purus et, euismod elit. Nullam
            eu ex urna. Cras laoreet, diam sit amet consequat suscipit, justo
            ipsum viverra nisi, sit amet vulputate ligula nibh ut ex. Morbi quis
            porttitor velit, eu tincidunt mi. Integer in ante vel enim ornare
            eleifend. Nulla molestie leo odio, quis bibendum quam maximus et.
            Sed libero elit, faucibus eu ipsum in, pharetra condimentum quam.
          </p>
        </article>
        <div className="flex flex-col gap-8">
          <div>
            <p className="font-heading font-bold uppercase tracking-widest text-slate-400">
              tags
            </p>
            <div className="flex flex-wrap gap-2">
              <TagButton>NumPy</TagButton>
              <TagButton>PyPy</TagButton>
              <TagButton>ML</TagButton>
              <TagButton>Diffusor</TagButton>
              <TagButton>Style Transfer</TagButton>
              <TagButton>Pandas</TagButton>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-heading font-bold uppercase tracking-widest text-slate-400">
              share
            </p>
            <div className="flex flex-wrap gap-4 ">
              <button className="grid h-5 w-5 cursor-pointer place-items-center rounded-full p-3 text-slate-500 hover:bg-slate-500 hover:text-white hover:shadow-md">
                <AiOutlineTwitter />
              </button>
              <button className="grid h-5 w-5 cursor-pointer place-items-center rounded-full p-3 text-slate-500 hover:bg-slate-500 hover:text-white hover:shadow-md">
                <AiFillLinkedin />
              </button>
              <button className="grid h-5 w-5 cursor-pointer place-items-center rounded-full p-3 text-slate-500 hover:bg-slate-500 hover:text-white hover:shadow-md">
                <BsFacebook />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TagButton({ children }) {
  return (
    <button className="cursor-pointer rounded-md border border-solid border-slate-200 py-1 px-3   transition-all hover:border-white hover:bg-slate-400 hover:text-white hover:shadow-md">
      {children}
    </button>
  );
}
