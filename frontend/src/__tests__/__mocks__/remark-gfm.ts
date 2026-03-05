// Mock remark-gfm plugin — returns identity function
export default function remarkGfm() {
  return (tree: unknown) => tree;
}
