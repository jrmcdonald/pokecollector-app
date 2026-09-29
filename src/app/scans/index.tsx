import { router } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet } from 'react-native';

import { parseUpstreamTime } from '@/api/scan';
import type { ScanJob } from '@/api/schemas';
import { ListRow } from '@/components/list-row';
import { ProgressBar } from '@/components/progress-bar';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { ThemedView } from '@/components/themed-view';
import { useScanJobs } from '@/hooks/queries';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useColors } from '@/theme';

/**
 * Scans left for later: every job with a photo not yet added or skipped,
 * from this app or the web UI, newest first. Jobs still being read refresh
 * every 10 seconds while this is open.
 */
export default function Scans() {
  const colors = useColors();
  const jobs = useScanJobs({ poll: true });
  const pull = usePullToRefresh(() => jobs.refetch());

  return (
    <ThemedView style={styles.fill}>
      {jobs.data ? (
        <FlatList
          data={jobs.data}
          keyExtractor={(job) => String(job.id)}
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl
              refreshing={pull.refreshing}
              onRefresh={pull.onRefresh}
              tintColor={colors.textSecondary}
            />
          }
          renderItem={({ item: job }) => <JobRow job={job} />}
          ListEmptyComponent={
            <EmptyState
              title="Nothing to review"
              message="A batch sent from the Scan tab waits here until every photo is added or skipped."
            />
          }
        />
      ) : jobs.error ? (
        <ErrorState error={jobs.error} onRetry={() => jobs.refetch()} />
      ) : (
        <ListSkeleton rows={4} />
      )}
    </ThemedView>
  );
}

function JobRow({ job }: { job: ScanJob }) {
  const total = job.total ?? 0;
  const reading = job.active ?? 0;
  const toReview = job.attention ?? 0;
  const title = total === 1 ? '1 photo' : `${total} photos`;
  const when = sentAt(job.created_at);
  const status = [
    toReview > 0 ? `${toReview} to review` : null,
    reading > 0 ? `${total - reading} of ${total} read` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <ListRow
      title={when ? `${title}, ${when}` : title}
      subtitle={status}
      footer={
        reading > 0 ? (
          <ProgressBar value={(total - reading) / Math.max(1, total)} decorative />
        ) : null
      }
      onPress={() => router.push({ pathname: '/scans/[id]', params: { id: String(job.id) } })}
    />
  );
}

/** "29 Sept, 14:05", in the phone's time zone. */
function sentAt(value: string | null | undefined): string | null {
  const at = parseUpstreamTime(value);
  if (at === null) return null;
  return new Date(at).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
