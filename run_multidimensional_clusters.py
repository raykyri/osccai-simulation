import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.decomposition import PCA
import matplotlib.pyplot as plt
import time
from tqdm import tqdm
import sys
import importlib.util

def kmeans_silhouette(data, k):
    kmeans = KMeans(n_clusters=k, random_state=42)
    labels = kmeans.fit_predict(data)
    score = silhouette_score(data, labels)
    return score, kmeans

def load_vote_matrix(file_path):
    spec = importlib.util.spec_from_file_location("vote_matrix_module", file_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return np.array(module.voteMatrix)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python run_multidimensional_clusters.py <path_to_vote_matrix_file>")
        sys.exit(1)

    vote_matrix_file = sys.argv[1]
    vote_matrix = load_vote_matrix(vote_matrix_file)

    k_values = range(2, 10)

    # Perform PCA
    print("Performing PCA projection...")
    start_time = time.time()
    pca = PCA(n_components=2)
    pca_projection = pca.fit_transform(vote_matrix)
    print(f"PCA projection completed in {time.time() - start_time:.2f} seconds")

    # Initialize lists to store scores
    silhouette_scores_matrix = []
    silhouette_scores_pca = []

    # Compute silhouette scores for different K values
    print("Computing silhouette scores...")
    for k in tqdm(k_values):
        # Matrix-based analysis
        start_time = time.time()
        score_matrix, _ = kmeans_silhouette(vote_matrix, k)
        silhouette_scores_matrix.append(score_matrix)
        print(f"Matrix-based Silhouette Coefficient for K={k}: {score_matrix:.4f} (Time: {time.time() - start_time:.2f}s)")
        
        # PCA-based analysis
        start_time = time.time()
        score_pca, _ = kmeans_silhouette(pca_projection, k)
        silhouette_scores_pca.append(score_pca)
        print(f"PCA-based Silhouette Coefficient for K={k}: {score_pca:.4f} (Time: {time.time() - start_time:.2f}s)")

    # Find the optimal K for both methods
    optimal_k_matrix = k_values[np.argmax(silhouette_scores_matrix)]
    optimal_k_pca = k_values[np.argmax(silhouette_scores_pca)]
    print(f"\nOptimal K value (Matrix): {optimal_k_matrix}")
    print(f"Optimal K value (PCA): {optimal_k_pca}")

    # Perform K-means clustering with the optimal K for both methods
    print("\nPerforming final clustering...")
    start_time = time.time()
    _, kmeans_matrix = kmeans_silhouette(vote_matrix, optimal_k_matrix)
    print(f"Matrix-based clustering completed in {time.time() - start_time:.2f} seconds")

    start_time = time.time()
    _, kmeans_pca = kmeans_silhouette(pca_projection, optimal_k_pca)
    print(f"PCA-based clustering completed in {time.time() - start_time:.2f} seconds")

    # Get cluster sizes for both methods
    cluster_sizes_matrix = np.bincount(kmeans_matrix.labels_)
    cluster_sizes_pca = np.bincount(kmeans_pca.labels_)

    print("\nMatrix-based cluster sizes (big to small):")
    for i, size in enumerate(sorted(cluster_sizes_matrix, reverse=True)):
        print(f"Cluster {i+1}: {size}")

    print("\nPCA-based cluster sizes (big to small):")
    for i, size in enumerate(sorted(cluster_sizes_pca, reverse=True)):
        print(f"Cluster {i+1}: {size}")

    # Plot silhouette scores
    plt.figure(figsize=(10, 6))
    plt.plot(k_values, silhouette_scores_matrix, 'bo-', label='Matrix-based')
    plt.plot(k_values, silhouette_scores_pca, 'ro-', label='PCA-based')
    plt.xlabel('Number of Clusters (K)')
    plt.ylabel('Silhouette Score')
    plt.title('Silhouette Score vs. Number of Clusters')
    plt.legend()
    plt.show()

    # Plot PCA projection
    plt.figure(figsize=(10, 8))
    scatter = plt.scatter(pca_projection[:, 0], pca_projection[:, 1], c=kmeans_pca.labels_, cmap='viridis')
    plt.colorbar(scatter)
    plt.xlabel('PC1')
    plt.ylabel('PC2')
    plt.title('PCA Projection with K-means Clustering')
    plt.show()