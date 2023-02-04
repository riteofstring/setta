import { motion } from "framer-motion";
import { ResizableDescription } from "./ResizableDescription";
export function DescriptionWrapper({ descVis, children }) {
  const variants = {
    ease: "easeOut",

    initial: { opacity: 0, height: 0 },
    open: {
      opacity: 1,
      height: "auto",
    },
    collapsed: { opacity: 0, height: 0 },
  };

  return (
    <motion.div
      layout="position"
      className="flex"
      variants={variants}
      initial={"initial"}
      animate={descVis ? "open" : "collapsed"}
    >
      <ResizableDescription>
        <div className="m-8 w-min flex-1 self-stretch overflow-y-scroll [&_.prose]:p-0">
          {children}
        </div>
      </ResizableDescription>
    </motion.div>
  );
}
