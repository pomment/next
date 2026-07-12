import { Button, Card, Empty } from 'tdesign-react';

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <Card className="state-card" bordered={false}>
      <Empty title="加载失败" description={message} />
      {retry && (
        <Button theme="primary" variant="outline" onClick={retry}>
          重新加载
        </Button>
      )}
    </Card>
  );
}
